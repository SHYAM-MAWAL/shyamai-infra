"""Data models shared by the sitemap parser, URL checker and exporter."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime


@dataclass
class CheckConfig:
    """User-configurable settings for sitemap fetching and URL checking."""
    timeout: int = 10
    max_concurrent: int = 20
    retry_count: int = 2
    follow_redirects: bool = True
    verify_ssl: bool = True
    use_head_first: bool = True
    user_agent: str = "URLHealthChecker/1.0"
    per_domain_limit: int = 0  # 0 = unlimited (full speed on single-domain sitemaps)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "CheckConfig":
        defaults = cls()
        return cls(
            timeout=int(data.get("timeout", defaults.timeout)),
            max_concurrent=int(data.get("max_concurrent", defaults.max_concurrent)),
            retry_count=int(data.get("retry_count", defaults.retry_count)),
            follow_redirects=bool(data.get("follow_redirects", defaults.follow_redirects)),
            verify_ssl=bool(data.get("verify_ssl", defaults.verify_ssl)),
            use_head_first=bool(data.get("use_head_first", defaults.use_head_first)),
            user_agent=str(data.get("user_agent", defaults.user_agent)),
            per_domain_limit=int(data.get("per_domain_limit", defaults.per_domain_limit)),
        )


@dataclass
class UrlResult:
    """Outcome of checking a single URL."""
    url: str
    status_code: int | None = None
    response_time_ms: float | None = None
    final_url: str | None = None
    error: str | None = None
    method: str = "HEAD"
    checked_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    @property
    def category(self) -> str:
        """Status bucket used by the dashboard: 2xx / 3xx / 4xx / 5xx / error."""
        if self.status_code is None:
            return "error"
        return f"{self.status_code // 100}xx"

    @property
    def ok(self) -> bool:
        return self.status_code is not None and 200 <= self.status_code < 400

    def to_dict(self) -> dict:
        data = asdict(self)
        data["category"] = self.category
        data["ok"] = self.ok
        return data
