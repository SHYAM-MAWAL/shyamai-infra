"""SQLite-backed run history.

Every completed health check is stored as a `run` plus its per-URL `results`,
so runs can be compared over time (new errors / fixed / still broken / slower).
Old runs are purged after `retention_days` (default 15).
"""

import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from .models import UrlResult

logger = logging.getLogger(__name__)

DB_FILE = Path(__file__).resolve().parent.parent / "history.db"

SLOW_MS = 2000           # dashboard "slow" threshold
SLOWER_RATIO = 1.5       # compare: new time must be 1.5x old…
SLOWER_MIN_DELTA = 200   # …and at least 200ms worse


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                finished_at TEXT NOT NULL,
                trigger_type TEXT NOT NULL DEFAULT 'manual',
                sitemaps TEXT NOT NULL DEFAULT '[]',
                total INTEGER NOT NULL DEFAULT 0,
                count_2xx INTEGER NOT NULL DEFAULT 0,
                count_3xx INTEGER NOT NULL DEFAULT 0,
                count_4xx INTEGER NOT NULL DEFAULT 0,
                count_5xx INTEGER NOT NULL DEFAULT 0,
                count_err INTEGER NOT NULL DEFAULT 0,
                slow_count INTEGER NOT NULL DEFAULT 0,
                avg_ms REAL,
                success_rate REAL,
                stopped INTEGER NOT NULL DEFAULT 0
            )""")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS results (
                run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
                url TEXT NOT NULL,
                status_code INTEGER,
                category TEXT,
                response_time_ms REAL,
                final_url TEXT,
                error TEXT,
                method TEXT,
                checked_at TEXT
            )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_results_run ON results(run_id)")


def save_run(results: list[UrlResult], sitemaps: list[str], started_at: str,
             trigger: str = "manual", stopped: bool = False) -> int:
    """Store a finished run and its results; returns the new run id."""
    cats = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "error": 0}
    times = []
    for r in results:
        cats[r.category] = cats.get(r.category, 0) + 1
        if r.response_time_ms is not None:
            times.append(r.response_time_ms)
    total = len(results)
    ok = cats["2xx"] + cats["3xx"]

    with _conn() as conn:
        cur = conn.execute(
            """INSERT INTO runs (started_at, finished_at, trigger_type, sitemaps,
                                 total, count_2xx, count_3xx, count_4xx, count_5xx,
                                 count_err, slow_count, avg_ms, success_rate, stopped)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (started_at, datetime.now().isoformat(timespec="seconds"), trigger,
             json.dumps(sitemaps), total,
             cats["2xx"], cats["3xx"], cats["4xx"], cats["5xx"], cats["error"],
             sum(1 for t in times if t > SLOW_MS),
             round(sum(times) / len(times), 1) if times else None,
             round(ok / total * 100, 2) if total else None,
             int(stopped)),
        )
        run_id = cur.lastrowid
        conn.executemany(
            """INSERT INTO results (run_id, url, status_code, category,
                                    response_time_ms, final_url, error, method, checked_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            [(run_id, r.url, r.status_code, r.category, r.response_time_ms,
              r.final_url, r.error, r.method, r.checked_at) for r in results],
        )
    logger.info("Saved run #%d (%d results, trigger=%s)", run_id, total, trigger)
    return run_id


def list_runs(limit: int = 200) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    runs = []
    for row in rows:
        d = dict(row)
        d["sitemaps"] = json.loads(d["sitemaps"])
        runs.append(d)
    return runs


def get_run(run_id: int) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["sitemaps"] = json.loads(d["sitemaps"])
    return d


def get_run_results(run_id: int) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM results WHERE run_id = ?", (run_id,)).fetchall()
    return [dict(r) for r in rows]


def previous_run_id(before_id: int) -> int | None:
    """Most recent non-stopped run before the given one (for auto-compare/alerts)."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT id FROM runs WHERE id < ? AND stopped = 0 ORDER BY id DESC LIMIT 1",
            (before_id,)).fetchone()
    return row["id"] if row else None


def last_finished_at() -> datetime | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT finished_at FROM runs ORDER BY id DESC LIMIT 1").fetchone()
    return datetime.fromisoformat(row["finished_at"]) if row else None


def _is_ok(r: dict) -> bool:
    return r["status_code"] is not None and 200 <= r["status_code"] < 400


def compare_runs(old_id: int, new_id: int) -> dict | None:
    """Diff two runs into new_errors / fixed / still_broken / slower buckets."""
    old_run, new_run = get_run(old_id), get_run(new_id)
    if not old_run or not new_run:
        return None
    old = {r["url"]: r for r in get_run_results(old_id)}
    new = {r["url"]: r for r in get_run_results(new_id)}

    new_errors, fixed, still_broken, slower = [], [], [], []

    for url, nr in new.items():
        orow = old.get(url)
        if not _is_ok(nr):
            entry = {
                "url": url,
                "old_status": orow["status_code"] if orow else None,
                "new_status": nr["status_code"],
                "error": nr["error"],
                "was_in_old": orow is not None,
            }
            if orow is None or _is_ok(orow):
                new_errors.append(entry)
            else:
                still_broken.append(entry)
        elif orow is not None:
            if not _is_ok(orow):
                fixed.append({
                    "url": url,
                    "old_status": orow["status_code"],
                    "new_status": nr["status_code"],
                    "old_error": orow["error"],
                })
            o_ms, n_ms = orow["response_time_ms"], nr["response_time_ms"]
            if (o_ms is not None and n_ms is not None
                    and n_ms >= o_ms * SLOWER_RATIO
                    and n_ms - o_ms >= SLOWER_MIN_DELTA):
                slower.append({
                    "url": url,
                    "old_ms": round(o_ms), "new_ms": round(n_ms),
                    "delta_ms": round(n_ms - o_ms),
                })

    slower.sort(key=lambda x: -x["delta_ms"])
    return {
        "old": old_run,
        "new": new_run,
        "new_errors": new_errors,
        "fixed": fixed,
        "still_broken": still_broken,
        "slower": slower[:200],
        "added_urls": sum(1 for u in new if u not in old),
        "removed_urls": sum(1 for u in old if u not in new),
    }


def purge_old(retention_days: int) -> int:
    """Delete runs older than retention_days. Returns number of runs removed."""
    cutoff = (datetime.now() - timedelta(days=retention_days)).isoformat()
    with _conn() as conn:
        cur = conn.execute("DELETE FROM runs WHERE started_at < ?", (cutoff,))
    if cur.rowcount:
        logger.info("Purged %d runs older than %d days", cur.rowcount, retention_days)
    return cur.rowcount
