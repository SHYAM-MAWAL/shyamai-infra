"""Async URL health checker.

Checks a list of URLs concurrently with aiohttp using a semaphore-bounded
pool (default 20 concurrent). Tries HEAD first (configurable) and falls back
to GET when the server rejects HEAD. Each finished result is delivered
through a callback so the UI can stream progress in real time.
"""

import asyncio
import logging
import time
from collections import defaultdict
from typing import Callable
from urllib.parse import urlparse

import aiohttp

from .models import CheckConfig, UrlResult

logger = logging.getLogger(__name__)

# Status codes that mean "this server does not support HEAD" -> retry as GET
HEAD_FALLBACK_CODES = {403, 405, 501}


class UrlChecker:
    def __init__(self, config: CheckConfig):
        self.config = config
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    @property
    def stopped(self) -> bool:
        return self._stop.is_set()

    async def _request(self, session: aiohttp.ClientSession, method: str, url: str) -> UrlResult:
        start = time.perf_counter()
        async with session.request(
            method, url,
            allow_redirects=self.config.follow_redirects,
        ) as resp:
            # Drain a small chunk so response time reflects actual delivery
            if method == "GET":
                await resp.content.read(1024)
            elapsed_ms = (time.perf_counter() - start) * 1000
            return UrlResult(
                url=url,
                status_code=resp.status,
                response_time_ms=round(elapsed_ms, 1),
                final_url=str(resp.url) if str(resp.url) != url else None,
                method=method,
            )

    async def _check_one(self, session: aiohttp.ClientSession, url: str,
                         semaphore: asyncio.Semaphore,
                         host_semaphores: dict | None) -> UrlResult:
        if host_semaphores is not None:
            host_sem = host_semaphores[urlparse(url).netloc]
            async with semaphore, host_sem:
                return await self._check_with_retries(session, url)
        async with semaphore:
            return await self._check_with_retries(session, url)

    async def _check_with_retries(self, session: aiohttp.ClientSession, url: str) -> UrlResult:
        if self._stop.is_set():
            return UrlResult(url=url, error="cancelled")

        last_error = "unknown error"
        for attempt in range(self.config.retry_count + 1):
            if self._stop.is_set():
                return UrlResult(url=url, error="cancelled")
            try:
                method = "HEAD" if self.config.use_head_first else "GET"
                result = await self._request(session, method, url)
                if method == "HEAD" and result.status_code in HEAD_FALLBACK_CODES:
                    result = await self._request(session, "GET", url)
                return result
            except asyncio.TimeoutError:
                last_error = f"timeout after {self.config.timeout}s"
            except aiohttp.ClientSSLError as exc:
                last_error = f"SSL error: {exc}"
                break  # retrying won't fix a certificate problem
            except aiohttp.ClientError as exc:
                last_error = f"{type(exc).__name__}: {exc}"
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {exc}"
            if attempt < self.config.retry_count:
                await asyncio.sleep(0.3 * (attempt + 1))

        return UrlResult(url=url, error=last_error, method="-")

    async def check_urls(self, urls: list[str],
                         progress_cb: Callable[[UrlResult, int, int], None] | None = None
                         ) -> list[UrlResult]:
        """Check all URLs; calls progress_cb(result, done_count, total) per URL."""
        self._stop.clear()
        timeout = aiohttp.ClientTimeout(total=self.config.timeout)
        connector = aiohttp.TCPConnector(
            ssl=self.config.verify_ssl,
            limit=self.config.max_concurrent,
        )
        semaphore = asyncio.Semaphore(self.config.max_concurrent)
        # Optional politeness cap per hostname (0 = unlimited)
        host_semaphores = (
            defaultdict(lambda: asyncio.Semaphore(self.config.per_domain_limit))
            if self.config.per_domain_limit > 0 else None
        )
        headers = {"User-Agent": self.config.user_agent}
        total = len(urls)
        results: list[UrlResult] = []

        async with aiohttp.ClientSession(timeout=timeout, connector=connector,
                                         headers=headers) as session:
            tasks = [
                asyncio.create_task(self._check_one(session, url, semaphore, host_semaphores))
                for url in urls
            ]
            for done, task in enumerate(asyncio.as_completed(tasks), start=1):
                result = await task
                results.append(result)
                if progress_cb:
                    progress_cb(result, done, total)

        return results
