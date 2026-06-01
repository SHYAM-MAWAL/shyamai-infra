from uuid import UUID
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, text
from ..database import get_db
from ..models import Job, SavedJob, User
from ..schemas import JobOut, JobCreate, PaginatedJobs
from ..auth import get_current_user, require_admin, get_optional_user
import math

router = APIRouter(prefix="/jobs", tags=["jobs"])

PRIORITY_CITIES = ["pune", "mumbai", "hyderabad", "bangalore", "bengaluru"]


def _cutoff():
    return datetime.now(timezone.utc) - timedelta(days=30)


def build_job_query(db: Session, keyword=None, location=None, category=None,
                    work_type=None, job_type=None, exp_min=None, exp_max=None,
                    salary_min=None, salary_max=None, source=None, skills=None):
    q = (db.query(Job)
           .filter(Job.is_active == True, Job.is_expired == False)
           .filter(func.coalesce(Job.posted_date, Job.created_at) >= _cutoff()))

    if keyword:
        kw = f"%{keyword.lower()}%"
        q = q.filter(or_(
            func.lower(Job.title).like(kw),
            func.lower(Job.company_name).like(kw),
            func.lower(Job.description).like(kw),
        ))
    if location:
        loc = f"%{location.lower()}%"
        q = q.filter(or_(
            func.lower(Job.location).like(loc),
            func.lower(Job.city).like(loc),
        ))
    if category:
        q = q.filter(func.lower(Job.category) == category.lower())
    if work_type:
        q = q.filter(Job.work_type == work_type)
    if job_type:
        q = q.filter(Job.job_type == job_type)
    if exp_min is not None:
        q = q.filter(or_(Job.experience_max >= exp_min, Job.experience_max == None))
    if exp_max is not None:
        q = q.filter(or_(Job.experience_min <= exp_max, Job.experience_min == None))
    if salary_min is not None:
        q = q.filter(or_(Job.salary_max >= salary_min, Job.salary_max == None))
    if salary_max is not None:
        q = q.filter(or_(Job.salary_min <= salary_max, Job.salary_min == None))
    if source:
        q = q.filter(Job.source == source)
    if skills:
        for skill in skills.split(","):
            s = skill.strip().lower()
            q = q.filter(Job.skills.any(func.lower(func.unnest(Job.skills)) == s))

    return q


@router.get("", response_model=PaginatedJobs)
def list_jobs(
    keyword: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    work_type: Optional[str] = Query(None),
    job_type: Optional[str] = Query(None),
    experience_min: Optional[int] = Query(None),
    experience_max: Optional[int] = Query(None),
    salary_min: Optional[int] = Query(None),
    salary_max: Optional[int] = Query(None),
    source: Optional[str] = Query(None),
    skills: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = build_job_query(db, keyword, location, category, work_type, job_type,
                        experience_min, experience_max, salary_min, salary_max, source, skills)
    total = q.count()
    jobs = (
        q.order_by(Job.posted_date.desc().nullslast(), Job.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return PaginatedJobs(
        jobs=jobs,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total else 0,
    )


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: UUID, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("", response_model=JobOut)
def create_job(payload: JobCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    job = Job(**payload.model_dump())
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}")
def delete_job(job_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"message": "Deleted"}


@router.post("/{job_id}/save")
def save_job(job_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    existing = db.query(SavedJob).filter(SavedJob.user_id == user.id, SavedJob.job_id == job_id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"saved": False}
    saved = SavedJob(user_id=user.id, job_id=job_id)
    db.add(saved)
    db.commit()
    return {"saved": True}


@router.get("/user/saved", response_model=list[JobOut])
def get_saved_jobs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    saved = db.query(SavedJob).filter(SavedJob.user_id == user.id).all()
    return [s.job for s in saved]
