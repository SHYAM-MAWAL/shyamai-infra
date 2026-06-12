"""Async sitemap fetcher/parser.

Downloads sitemap XML files (including nested <sitemapindex> files) with
aiohttp and extracts every URL found in <loc> tags. Up to 50 sitemaps are
fetched concurrently.
"""

import asyncio
import gzip
import logging
import xml.etree.ElementTree as ET
from typing import Callable

import aiohttp

from .models import CheckConfig

logger = logging.getLogger(__name__)

SITEMAP_CONCURRENCY = 50
MAX_SITEMAP_DEPTH = 5  # guard against sitemapindex loops


def _local_name(tag: str) -> str:
    """Strip the XML namespace: '{ns}loc' -> 'loc'."""
    return tag.rsplit("}", 1)[-1].lower()


def parse_sitemap_xml(content: bytes) -> tuple[list[str], list[str]]:
    """Parse sitemap XML. Returns (page_urls, child_sitemap_urls)."""
    root = ET.fromstring(content)
    root_name = _local_name(root.tag)
    locs = [
        el.text.strip()
        for el in root.iter()
        if _local_name(el.tag) == "loc" and el.text and el.text.strip()
    ]
    if root_name == "sitemapindex":
        return [], locs
    return locs, []


class SitemapParser:
    def __init__(self, config: CheckConfig):
        self.config = config

    async def _fetch_one(self, session: aiohttp.ClientSession, url: str,
                         semaphore: asyncio.Semaphore) -> tuple[list[str], list[str]]:
        async with semaphore:
            try:
                async with session.get(url) as resp:
                    resp.raise_for_status()
                    body = await resp.read()
                if url.endswith(".gz") or body[:2] == b"\x1f\x8b":
                    body = gzip.decompress(body)
                return parse_sitemap_xml(body)
            except Exception as exc:
                logger.warning("Failed to fetch sitemap %s: %s", url, exc)
                return [], []

    async def fetch_urls(self, sitemap_urls: list[str],
                         progress_cb: Callable[[str, int], None] | None = None) -> list[str]:
        """Fetch all sitemaps (recursing into sitemap indexes) and return unique page URLs."""
        timeout = aiohttp.ClientTimeout(total=max(self.config.timeout, 30))
        connector = aiohttp.TCPConnector(ssl=self.config.verify_ssl, limit=SITEMAP_CONCURRENCY)
        semaphore = asyncio.Semaphore(SITEMAP_CONCURRENCY)
        headers = {"User-Agent": self.config.user_agent}

        seen_sitemaps: set[str] = set()
        page_urls: dict[str, None] = {}  # ordered de-dupe

        async with aiohttp.ClientSession(timeout=timeout, connector=connector,
                                         headers=headers) as session:
            pending = [u for u in sitemap_urls if u]
            for _ in range(MAX_SITEMAP_DEPTH):
                batch = [u for u in pending if u not in seen_sitemaps]
                if not batch:
                    break
                seen_sitemaps.update(batch)
                results = await asyncio.gather(
                    *(self._fetch_one(session, u, semaphore) for u in batch)
                )
                pending = []
                for sitemap_url, (urls, children) in zip(batch, results):
                    for u in urls:
                        page_urls[u] = None
                    pending.extend(children)
                    if progress_cb:
                        progress_cb(sitemap_url, len(page_urls))

        return list(page_urls)
