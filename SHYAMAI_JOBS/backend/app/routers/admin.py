from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import Job, User, ApifyRun
from ..schemas import DashboardStats, ApifyRunOut
from ..auth import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    total_jobs = db.query(Job).count()
    active_jobs = db.query(Job).filter(Job.is_active == True, Job.is_expired == False).count()
    jobs_today = db.query(Job).filter(Job.created_at >= today_start).count()
    jobs_this_week = db.query(Job).filter(Job.created_at >= week_start).count()

    city_rows = (
        db.query(Job.city, func.count(Job.id))
        .filter(Job.is_active == True, Job.city != None)
        .group_by(Job.city)
        .order_by(func.count(Job.id).desc())
        .limit(10)
        .all()
    )
    cat_rows = (
        db.query(Job.category, func.count(Job.id))
        .filter(Job.is_active == True, Job.category != None)
        .group_by(Job.category)
        .order_by(func.count(Job.id).desc())
        .limit(10)
        .all()
    )
    src_rows = (
        db.query(Job.source, func.count(Job.id))
        .filter(Job.is_active == True)
        .group_by(Job.source)
        .all()
    )

    recent_runs = (
        db.query(ApifyRun)
        .order_by(ApifyRun.started_at.desc())
        .limit(20)
        .all()
    )

    return DashboardStats(
        total_jobs=total_jobs,
        active_jobs=active_jobs,
        jobs_today=jobs_today,
        jobs_this_week=jobs_this_week,
        by_city={r[0]: r[1] for r in city_rows},
        by_category={r[0]: r[1] for r in cat_rows},
        by_source={r[0] or "unknown": r[1] for r in src_rows},
        recent_runs=[ApifyRunOut.model_validate(r) for r in recent_runs],
    )


@router.post("/collect-jobs")
async def trigger_collection(
    background_tasks: BackgroundTasks,
    source: str = "all",
    _=Depends(require_admin),
):
    """
    source="free"  → Adzuna + RemoteOK + Remotive (free, no Apify credits)
    source="apify" → LinkedIn + Indeed + Naukri via Apify (uses credits)
    source="all"   → free sources only (Apify is manual-only to save credits)
    """
    if source == "apify":
        from services.apify_service import collect_jobs_background
        background_tasks.add_task(collect_jobs_background, "all")
        return {"message": "Apify collection started (uses credits — LinkedIn/Indeed/Naukri)"}

    from services.free_jobs_service import collect_free_jobs
    background_tasks.add_task(collect_free_jobs)
    return {"message": "Free collection started (Adzuna + RemoteOK + Remotive)"}


@router.get("/runs", response_model=list[ApifyRunOut])
def get_runs(limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(ApifyRun).order_by(ApifyRun.started_at.desc()).limit(limit).all()


@router.get("/users")
def get_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [{"id": str(u.id), "email": u.email, "full_name": u.full_name,
             "role": u.role, "is_active": u.is_active, "created_at": u.created_at} for u in users]


@router.post("/expire-old-jobs")
def expire_old_jobs(db: Session = Depends(get_db), _=Depends(require_admin)):
    from sqlalchemy import text
    result = db.execute(text(
        "DELETE FROM jobs WHERE COALESCE(posted_date, created_at) < NOW() - INTERVAL '30 days'"
    ))
    db.commit()
    return {"deleted": result.rowcount, "message": f"Deleted {result.rowcount} jobs older than 30 days"}
