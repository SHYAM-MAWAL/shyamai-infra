import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Integer, Text, DateTime,
    ForeignKey, ARRAY, JSON, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(String(20), default="user")  # admin, user
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String(100))
    verification_token_expires = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    saved_jobs = relationship("SavedJob", back_populates="user", cascade="all, delete-orphan")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(500), nullable=False, index=True)
    company_name = Column(String(500), nullable=False, index=True)
    description = Column(Text)
    requirements = Column(Text)
    skills = Column(ARRAY(String), default=list)
    location = Column(String(500), index=True)
    city = Column(String(100), index=True)
    state = Column(String(100), default="India")
    is_remote = Column(Boolean, default=False)
    work_type = Column(String(20), default="on-site")  # remote, hybrid, on-site
    job_type = Column(String(30), default="full-time")  # full-time, part-time, contract, internship
    experience_min = Column(Integer)
    experience_max = Column(Integer)
    salary_min = Column(Integer)
    salary_max = Column(Integer)
    salary_currency = Column(String(10), default="INR")
    salary_text = Column(String(200))
    category = Column(String(100), index=True)
    source = Column(String(50), index=True)
    source_url = Column(Text)
    source_job_id = Column(String(500))
    posted_date = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    is_expired = Column(Boolean, default=False)
    apify_run_id = Column(String(100))
    raw_data = Column(JSON)
    automation_status = Column(String(50), default="IN_PROGRESS")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    saved_by = relationship("SavedJob", back_populates="job", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("source", "source_job_id", name="uq_job_source_id"),
    )


class SavedJob(Base):
    __tablename__ = "saved_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="saved_jobs")
    job = relationship("Job", back_populates="saved_by")

    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_saved_job"),
    )


class ApifyRun(Base):
    __tablename__ = "apify_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(String(100))
    actor_id = Column(String(200))
    source = Column(String(50))
    search_query = Column(String(500))
    status = Column(String(50), default="started")
    jobs_collected = Column(Integer, default=0)
    jobs_new = Column(Integer, default=0)
    jobs_duplicate = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True))
