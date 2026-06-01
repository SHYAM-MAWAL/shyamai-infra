import logging
from datetime import date, timedelta, timezone, datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None
_last_run_date: date | None = None


def _cleanup_old_jobs():
    """Delete jobs older than 30 days. Runs daily just before collection."""
    from app.database import SessionLocal
    from app.models import Job
    from sqlalchemy import text

    db = SessionLocal()
    try:
        result = db.execute(text("""
            DELETE FROM jobs
            WHERE COALESCE(posted_date, created_at) < NOW() - INTERVAL '30 days'
        """))
        db.commit()
        deleted = result.rowcount
        if deleted:
            logger.info(f"Cleanup: deleted {deleted} jobs older than 30 days")
    except Exception as e:
        db.rollback()
        logger.error(f"Cleanup error: {e}")
    finally:
        db.close()


def _daily_job():
    global _last_run_date
    today = date.today()

    if _last_run_date == today:
        logger.info("Daily collection already ran today — skipping")
        return

    _last_run_date = today
    logger.info(f"Starting daily job collection ({today})")

    # 1. Clean up stale jobs first
    _cleanup_old_jobs()

    # 2. Collect fresh jobs from all free sources
    from .free_jobs_service import collect_free_jobs
    collect_free_jobs()


def run_cleanup_now():
    """Exposed for the admin panel to trigger manual cleanup."""
    _cleanup_old_jobs()


def start_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        return

    _scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    _scheduler.add_job(
        _daily_job,
        trigger=CronTrigger(hour=7, minute=0, timezone="Asia/Kolkata"),
        id="daily_collect",
        name="Daily Job Collection + Cleanup — 7AM IST",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.start()
    logger.info("Scheduler started — collection + cleanup runs daily at 7:00 AM IST")


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
