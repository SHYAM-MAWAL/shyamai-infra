"""Schedule due-time math for automatic checks.

Every schedule is anchored to a user-picked start datetime. Shapes
(stored in config.json under settings.schedules):
  once:     {type:'once', date:'YYYY-MM-DD', time:'HH:MM'}
  daily:    {type:'daily', time:'HH:MM', start:iso}
  weekly:   {type:'weekly', time:'HH:MM', days:[0-6], start:iso}  (0=Mon … 6=Sun)
  interval: {type:'interval', interval_hours: float, start:iso}
All carry: id, enabled, created_at, last_run (iso or None).

daily/weekly fire at their time-of-day, but never before `start`.
interval fires at `start`, then every interval_hours.
Legacy schedules without `start` fall back to created_at (exclusive),
so they never fire retroactively.
"""

from datetime import datetime, timedelta


def _hm(s: str) -> tuple[int, int]:
    h, m = s.split(":")
    return int(h), int(m)


def _at(day: datetime, time_str: str) -> datetime:
    h, m = _hm(time_str)
    return day.replace(hour=h, minute=m, second=0, microsecond=0)


def _lower_bound(sched: dict) -> tuple[datetime | None, bool]:
    """(earliest allowed occurrence, inclusive?) for this schedule."""
    if sched.get("start"):
        return datetime.fromisoformat(sched["start"]), True
    if sched.get("created_at"):
        return datetime.fromisoformat(sched["created_at"]), False
    return None, True


def last_occurrence(sched: dict, now: datetime) -> datetime | None:
    """Most recent pattern occurrence at or before `now` (ignores bounds)."""
    stype = sched.get("type")

    if stype == "once":
        dt = datetime.fromisoformat(f"{sched['date']}T{sched['time']}")
        return dt if dt <= now else None

    if stype == "daily":
        cand = _at(now, sched["time"])
        return cand if cand <= now else cand - timedelta(days=1)

    if stype == "weekly":
        days = set(sched.get("days") or [])
        if not days:
            return None
        for i in range(8):
            cand = _at(now - timedelta(days=i), sched["time"])
            if cand.weekday() in days and cand <= now:
                return cand
        return None

    if stype == "interval":
        hours = float(sched.get("interval_hours") or 0)
        if hours <= 0:
            return None
        if sched.get("last_run"):
            nxt = datetime.fromisoformat(sched["last_run"]) + timedelta(hours=hours)
            return nxt if nxt <= now else None
        lower, _ = _lower_bound(sched)
        first = lower if lower else now
        return first if first <= now else None

    return None


def is_due(sched: dict, now: datetime) -> bool:
    if not sched.get("enabled", True):
        return False
    occ = last_occurrence(sched, now)
    if occ is None:
        return False
    lower, inclusive = _lower_bound(sched)
    if lower is not None and (occ < lower if inclusive else occ <= lower):
        return False
    last_run = sched.get("last_run")
    return not last_run or datetime.fromisoformat(last_run) < occ


def next_run(sched: dict, now: datetime) -> datetime | None:
    """Next moment this schedule will fire (for display)."""
    if not sched.get("enabled", True):
        return None
    stype = sched.get("type")
    lower, _ = _lower_bound(sched)
    base = max(now, lower) if lower else now

    if stype == "once":
        if sched.get("last_run"):
            return None
        return datetime.fromisoformat(f"{sched['date']}T{sched['time']}")

    if stype == "daily":
        cand = _at(base, sched["time"])
        return cand if cand >= base else cand + timedelta(days=1)

    if stype == "weekly":
        days = set(sched.get("days") or [])
        if not days:
            return None
        for i in range(8):
            cand = _at(base + timedelta(days=i), sched["time"])
            if cand.weekday() in days and cand >= base:
                return cand
        return None

    if stype == "interval":
        hours = float(sched.get("interval_hours") or 0)
        if hours <= 0:
            return None
        if sched.get("last_run"):
            return datetime.fromisoformat(sched["last_run"]) + timedelta(hours=hours)
        return base

    return None
