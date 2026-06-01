from __future__ import annotations
from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr


# ─── Auth ────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class RegisterResponse(BaseModel):
    message: str
    email: str


# ─── Jobs ────────────────────────────────────────────────────────────────────

class JobOut(BaseModel):
    id: UUID
    title: str
    company_name: str
    description: Optional[str]
    requirements: Optional[str]
    skills: Optional[List[str]]
    location: Optional[str]
    city: Optional[str]
    state: Optional[str]
    is_remote: bool
    work_type: str
    job_type: str
    experience_min: Optional[int]
    experience_max: Optional[int]
    salary_min: Optional[int]
    salary_max: Optional[int]
    salary_currency: str
    salary_text: Optional[str]
    category: Optional[str]
    source: Optional[str]
    source_url: Optional[str]
    posted_date: Optional[datetime]
    is_active: bool
    is_expired: bool
    created_at: datetime

    class Config:
        from_attributes = True


class JobCreate(BaseModel):
    title: str
    company_name: str
    description: Optional[str] = None
    requirements: Optional[str] = None
    skills: Optional[List[str]] = []
    location: Optional[str] = None
    city: Optional[str] = None
    work_type: str = "on-site"
    job_type: str = "full-time"
    experience_min: Optional[int] = None
    experience_max: Optional[int] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_text: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    source_url: Optional[str] = None
    posted_date: Optional[datetime] = None


class JobFilter(BaseModel):
    keyword: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    work_type: Optional[str] = None
    job_type: Optional[str] = None
    experience_min: Optional[int] = None
    experience_max: Optional[int] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    source: Optional[str] = None
    skills: Optional[str] = None
    page: int = 1
    per_page: int = 20


class PaginatedJobs(BaseModel):
    jobs: List[JobOut]
    total: int
    page: int
    per_page: int
    total_pages: int


# ─── Admin / Stats ───────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_jobs: int
    active_jobs: int
    jobs_today: int
    jobs_this_week: int
    by_city: dict
    by_category: dict
    by_source: dict
    recent_runs: List[ApifyRunOut]


class ApifyRunOut(BaseModel):
    id: UUID
    source: Optional[str]
    search_query: Optional[str]
    status: str
    jobs_collected: int
    jobs_new: int
    jobs_duplicate: int
    error_message: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# Fix forward reference
DashboardStats.model_rebuild()
