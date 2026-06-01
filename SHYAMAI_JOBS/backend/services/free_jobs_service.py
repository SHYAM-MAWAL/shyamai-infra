"""
Free job collection service — no Apify credits needed.
Sources:
  - LinkedIn Guest API  (free, no key — public endpoint, ~25 jobs/search)
  - Adzuna India API    (free, 250 calls/month)
  - JSearch RapidAPI    (free, 10 req/day — Google Jobs aggregator)
  - RemoteOK            (free, no key — remote IT jobs)
  - Remotive            (free, no key — remote dev jobs)
"""
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
import httpx
from bs4 import BeautifulSoup

from app.config import settings
from app.database import SessionLocal
from app.models import Job, ApifyRun

logger = logging.getLogger(__name__)

MAX_JOB_AGE_DAYS = 30   # jobs older than this are skipped on insert and deleted daily


def _is_too_old(posted_date: Optional[datetime], max_days: int = MAX_JOB_AGE_DAYS) -> bool:
    """Return True if the job's posted date is older than max_days."""
    if not posted_date:
        return False   # no date → keep it (we'll age it out by created_at later)
    if posted_date.tzinfo is None:
        posted_date = posted_date.replace(tzinfo=timezone.utc)
    return posted_date < datetime.now(timezone.utc) - timedelta(days=max_days)

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) ShyamAI-Jobs/1.0"}

SEARCH_CITIES = [
    ("Pune",      "pune"),
    ("Mumbai",    "mumbai"),
    ("Hyderabad", "hyderabad"),
    ("Bangalore", "bangalore"),
]

IT_KEYWORDS = [
    "software engineer", "python developer", "java developer",
    "full stack developer", "devops engineer", "data engineer",
]

# ─── Helpers shared with apify_service ───────────────────────────────────────

def _detect_work_type(text: Optional[str]) -> str:
    if not text: return "on-site"
    t = str(text).lower()
    if "remote" in t: return "remote"
    if "hybrid" in t: return "hybrid"
    return "on-site"


def _map_category(title: Optional[str]) -> Optional[str]:
    if not title: return None
    t = title.lower()
    rules = [
        ("java", "Java Developer"), ("python", "Python Developer"),
        ("full stack", "Full Stack Developer"), ("fullstack", "Full Stack Developer"),
        ("backend", "Backend Developer"), ("frontend", "Frontend Developer"),
        ("devops", "DevOps Engineer"), ("cloud", "Cloud Engineer"),
        ("aws", "Cloud Engineer"), ("data engineer", "Data Engineer"),
        ("data analyst", "Data Analyst"), ("ml engineer", "AI/ML Engineer"),
        ("machine learn", "AI/ML Engineer"), ("qa", "QA Engineer"),
    ]
    for key, cat in rules:
        if key in t: return cat
    return "Software Engineer"


def _parse_date(val) -> Optional[datetime]:
    if not val: return None
    if isinstance(val, datetime): return val
    try:
        from dateutil import parser as dp
        return dp.parse(str(val))
    except Exception: return None


def _already_exists(db, source: str, job_id: str) -> bool:
    return db.query(Job).filter(
        Job.source == source, Job.source_job_id == str(job_id)
    ).first() is not None


def _log_run(db, source, query, new, dupes, error=None):
    db.add(ApifyRun(
        actor_id=f"free/{source}",
        source=source,
        search_query=query,
        status="failed" if error else "completed",
        jobs_collected=new + dupes,
        jobs_new=new,
        jobs_duplicate=dupes,
        error_message=str(error)[:500] if error else None,
        completed_at=datetime.now(timezone.utc),
    ))
    db.commit()


# ─── Adzuna India ─────────────────────────────────────────────────────────────

def collect_adzuna(db, app_id: str, app_key: str) -> int:
    """Adzuna free tier: 250 calls/month. Covers India well."""
    total_new = 0
    for kw in IT_KEYWORDS[:4]:            # 4 keywords × 4 cities = 16 calls/day
        for city_label, _ in SEARCH_CITIES:
            query = f"{kw} {city_label}"
            new = dupes = 0
            try:
                r = httpx.get(
                    "https://api.adzuna.com/v1/api/jobs/in/search/1",
                    params={
                        "app_id": app_id,
                        "app_key": app_key,
                        "results_per_page": 50,
                        "what": kw,
                        "where": city_label,
                        "content-type": "application/json",
                    },
                    headers=HEADERS, timeout=15
                )
                r.raise_for_status()
                for item in r.json().get("results", []):
                    job_id = str(item.get("id", ""))
                    if not job_id: continue

                    posted = _parse_date(item.get("created"))
                    if _is_too_old(posted):
                        dupes += 1; continue

                    if _already_exists(db, "adzuna", job_id):
                        dupes += 1; continue

                    sal = item.get("salary_min") or item.get("salary_max")
                    db.add(Job(
                        title=item.get("title") or "Unknown",
                        company_name=item.get("company", {}).get("display_name") or "Unknown",
                        description=(item.get("description") or "")[:8000],
                        skills=[],
                        location=item.get("location", {}).get("display_name") or city_label,
                        city=city_label,
                        work_type=_detect_work_type(item.get("contract_time")),
                        job_type=(item.get("contract_type") or "full-time").replace("_", "-"),
                        salary_min=int(item["salary_min"]) if item.get("salary_min") else None,
                        salary_max=int(item["salary_max"]) if item.get("salary_max") else None,
                        salary_currency="INR",
                        category=_map_category(item.get("title")),
                        source="adzuna",
                        source_url=item.get("redirect_url"),
                        source_job_id=job_id,
                        posted_date=_parse_date(item.get("created")),
                        automation_status="IN_PROGRESS",
                        raw_data=item,
                    ))
                    new += 1

                db.commit()
                total_new += new
                _log_run(db, "adzuna", query, new, dupes)
                logger.info(f"Adzuna [{city_label}/{kw}]: +{new} new, {dupes} dupes")
            except Exception as e:
                logger.error(f"Adzuna error [{query}]: {e}")
                _log_run(db, "adzuna", query, 0, 0, error=e)

    return total_new


# ─── JSearch (RapidAPI) — aggregates Google Jobs ──────────────────────────────

def collect_jsearch(db, rapid_key: str) -> int:
    """JSearch free: 10 req/day. Pulls from LinkedIn, Indeed, Naukri, Glassdoor."""
    total_new = 0
    # Use only top 2 cities on free tier (10 req limit)
    for city_label, _ in SEARCH_CITIES[:2]:
        query = f"IT software developer {city_label} India"
        new = dupes = 0
        try:
            r = httpx.get(
                "https://jsearch.p.rapidapi.com/search",
                params={"query": query, "page": "1", "num_pages": "2",
                        "date_posted": "today", "country": "in"},
                headers={
                    "X-RapidAPI-Key": rapid_key,
                    "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
                },
                timeout=20
            )
            r.raise_for_status()
            for item in r.json().get("data", []):
                job_id = str(item.get("job_id", ""))
                if not job_id: continue

                posted = _parse_date(item.get("job_posted_at_datetime_utc"))
                if _is_too_old(posted):
                    dupes += 1; continue

                if _already_exists(db, "jsearch", job_id):
                    dupes += 1; continue

                db.add(Job(
                    title=item.get("job_title") or "Unknown",
                    company_name=item.get("employer_name") or "Unknown",
                    description=(item.get("job_description") or "")[:8000],
                    skills=item.get("job_required_skills") or [],
                    location=f"{item.get('job_city','')}, {item.get('job_state','')}".strip(", "),
                    city=city_label,
                    work_type="remote" if item.get("job_is_remote") else
                              _detect_work_type(item.get("job_employment_type")),
                    job_type=(item.get("job_employment_type") or "FULLTIME").upper()
                              .replace("FULLTIME","full-time").replace("PARTTIME","part-time")
                              .replace("CONTRACTOR","contract").replace("INTERN","internship")
                              .lower(),
                    experience_min=int(item["job_required_experience"]["required_experience_in_months"] / 12)
                                   if item.get("job_required_experience", {}).get("required_experience_in_months")
                                   else None,
                    category=_map_category(item.get("job_title")),
                    source="jsearch",
                    source_url=item.get("job_apply_link") or item.get("job_google_link"),
                    source_job_id=job_id,
                    posted_date=_parse_date(item.get("job_posted_at_datetime_utc")),
                    automation_status="IN_PROGRESS",
                    raw_data={k: v for k, v in item.items() if "description" not in k.lower()},
                ))
                new += 1

            db.commit()
            total_new += new
            _log_run(db, "jsearch", query, new, dupes)
            logger.info(f"JSearch [{city_label}]: +{new} new, {dupes} dupes")
        except Exception as e:
            logger.error(f"JSearch error [{city_label}]: {e}")
            _log_run(db, "jsearch", query, 0, 0, error=e)

    return total_new


# ─── RemoteOK (free, no key) ──────────────────────────────────────────────────

def collect_remoteok(db) -> int:
    IT_TAGS = ["dev", "python", "java", "javascript", "devops", "cloud", "react",
               "nodejs", "backend", "fullstack", "data", "engineer"]
    new = dupes = 0
    try:
        r = httpx.get("https://remoteok.com/api",
                      headers={**HEADERS, "Accept": "application/json"},
                      timeout=15, follow_redirects=True)
        r.raise_for_status()
        jobs = r.json()
        if isinstance(jobs, list) and jobs:
            jobs = jobs[1:]  # skip metadata object

        for item in jobs:
            tags = [t.lower() for t in (item.get("tags") or [])]
            if not any(t in IT_TAGS for t in tags):
                continue  # skip non-IT jobs

            job_id = str(item.get("id") or item.get("slug") or "")
            if not job_id: continue

            posted = _parse_date(item.get("date") or item.get("epoch"))
            if _is_too_old(posted):
                dupes += 1; continue

            if _already_exists(db, "remoteok", job_id):
                dupes += 1; continue

            db.add(Job(
                title=item.get("position") or "Unknown",
                company_name=item.get("company") or "Unknown",
                description=(item.get("description") or "")[:8000],
                skills=tags[:10],
                location="Remote",
                city="Remote",
                is_remote=True,
                work_type="remote",
                job_type="full-time",
                salary_text=item.get("salary"),
                category=_map_category(item.get("position")),
                source="remoteok",
                source_url=item.get("url"),
                source_job_id=job_id,
                posted_date=_parse_date(item.get("date") or item.get("epoch")),
                automation_status="IN_PROGRESS",
                raw_data={k: v for k, v in item.items() if k != "description"},
            ))
            new += 1

        db.commit()
        _log_run(db, "remoteok", "IT remote jobs", new, dupes)
        logger.info(f"RemoteOK: +{new} new IT jobs, {dupes} dupes")
    except Exception as e:
        logger.error(f"RemoteOK error: {e}")
        _log_run(db, "remoteok", "IT remote jobs", 0, 0, error=e)

    return new


# ─── Remotive (free, no key) ──────────────────────────────────────────────────

def collect_remotive(db) -> int:
    new = dupes = 0
    try:
        r = httpx.get("https://remotive.com/api/remote-jobs",
                      params={"category": "software-dev", "limit": 100},
                      headers=HEADERS, timeout=15, follow_redirects=True)
        r.raise_for_status()
        for item in r.json().get("jobs", []):
            job_id = str(item.get("id") or "")
            if not job_id: continue

            posted = _parse_date(item.get("publication_date"))
            if _is_too_old(posted):
                dupes += 1; continue

            if _already_exists(db, "remotive", job_id):
                dupes += 1; continue

            db.add(Job(
                title=item.get("title") or "Unknown",
                company_name=item.get("company_name") or "Unknown",
                description=(item.get("description") or "")[:8000],
                skills=[t.strip() for t in (item.get("tags") or [])],
                location=item.get("candidate_required_location") or "Remote / Worldwide",
                city="Remote",
                is_remote=True,
                work_type="remote",
                job_type=(item.get("job_type") or "full_time").replace("_", "-"),
                category=_map_category(item.get("title")),
                source="remotive",
                source_url=item.get("url"),
                source_job_id=job_id,
                posted_date=_parse_date(item.get("publication_date")),
                automation_status="IN_PROGRESS",
                raw_data=item,
            ))
            new += 1

        db.commit()
        _log_run(db, "remotive", "software dev remote", new, dupes)
        logger.info(f"Remotive: +{new} new, {dupes} dupes")
    except Exception as e:
        logger.error(f"Remotive error: {e}")
        _log_run(db, "remotive", "software dev remote", 0, 0, error=e)

    return new


# ─── LinkedIn Guest API (free, no key) ───────────────────────────────────────

_LI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def _linkedin_fetch(keyword: str, location: str, start: int = 0) -> list[dict]:
    try:
        r = httpx.get(
            "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
            params={"keywords": keyword, "location": location, "f_TPR": "r86400", "start": str(start)},
            headers=_LI_HEADERS, timeout=15, follow_redirects=True,
        )
        if r.status_code != 200 or len(r.text) < 100:
            return []
        soup = BeautifulSoup(r.text, "lxml")
        jobs = []
        for card in soup.find_all("li"):
            base = card.find("div", class_=lambda c: c and "base-card" in str(c))
            if not base:
                continue
            job_id  = base.get("data-entity-urn", "").split(":")[-1]
            title   = card.find("h3")
            company = card.find("h4")
            loc     = card.find("span", class_=lambda c: c and "location" in str(c).lower())
            link    = card.find("a", class_=lambda c: c and "base-card__full-link" in str(c))
            posted  = card.find("time")
            if not job_id or not title:
                continue
            jobs.append({
                "job_id":    job_id,
                "title":     title.text.strip(),
                "company":   company.text.strip() if company else "",
                "location":  loc.text.strip() if loc else location,
                "url":       link["href"].split("?")[0] if link else "",
                "posted_at": posted.get("datetime", "") if posted else "",
            })
        return jobs
    except Exception as e:
        logger.warning(f"LinkedIn fetch error (start={start}): {e}")
        return []


def collect_linkedin_free(db) -> int:
    """LinkedIn public guest API — up to 20 jobs/keyword/city, no credentials."""
    LI_SEARCHES = [
        ("software engineer",    "Pune, Maharashtra, India",    "Pune"),
        ("software engineer",    "Mumbai, Maharashtra, India",  "Mumbai"),
        ("python developer",     "Pune, Maharashtra, India",    "Pune"),
        ("java developer",       "Pune, Maharashtra, India",    "Pune"),
        ("full stack developer", "Pune, Maharashtra, India",    "Pune"),
        ("devops engineer",      "Pune, Maharashtra, India",    "Pune"),
        ("data engineer",        "Hyderabad, Telangana, India", "Hyderabad"),
        ("software engineer",    "Bangalore, Karnataka, India", "Bangalore"),
    ]
    total_new = 0

    for keyword, li_location, city in LI_SEARCHES:
        new = dupes = 0
        seen_in_run = set()   # dedup within same search (pages can overlap)

        for start in [0, 10]:
            items = _linkedin_fetch(keyword, li_location, start)
            if not items:
                break
            for item in items:
                job_id = item["job_id"]
                posted = _parse_date(item.get("posted_at"))
                if job_id in seen_in_run or _is_too_old(posted) or _already_exists(db, "linkedin_free", job_id):
                    dupes += 1
                    continue
                seen_in_run.add(job_id)
                db.add(Job(
                    title=item["title"],
                    company_name=item["company"] or "Unknown",
                    location=item["location"],
                    city=city,
                    work_type=_detect_work_type(item["location"]),
                    job_type="full-time",
                    category=_map_category(item["title"]),
                    source="linkedin_free",
                    source_url=item["url"],
                    source_job_id=job_id,
                    posted_date=_parse_date(item["posted_at"]),
                    automation_status="IN_PROGRESS",
                    raw_data=item,
                ))
                new += 1
            time.sleep(0.5)

        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.warning(f"LinkedIn Free [{city}/{keyword}]: commit conflict, skipping batch")
            continue

        _log_run(db, "linkedin_free", f"{keyword} – {city}", new, dupes)
        logger.info(f"LinkedIn Free [{city}/{keyword}]: +{new} new, {dupes} dupes")
        total_new += new

    return total_new


# ─── Main orchestrator ────────────────────────────────────────────────────────

def collect_free_jobs():
    """Run all free sources. Called daily at 7AM IST."""
    db = SessionLocal()
    total = 0
    try:
        # Always-free sources (no key needed)
        total += collect_linkedin_free(db)
        total += collect_remoteok(db)
        total += collect_remotive(db)

        # Adzuna India (free, needs app_id + app_key in .env)
        adzuna_id  = getattr(settings, "ADZUNA_APP_ID",  "") or ""
        adzuna_key = getattr(settings, "ADZUNA_APP_KEY", "") or ""
        if adzuna_id and adzuna_key:
            total += collect_adzuna(db, adzuna_id, adzuna_key)
        else:
            logger.info("Adzuna skipped — ADZUNA_APP_ID / ADZUNA_APP_KEY not set in .env")

        # JSearch via RapidAPI (free 10/day, needs key in .env)
        rapid_key = getattr(settings, "RAPIDAPI_KEY", "") or ""
        if rapid_key:
            total += collect_jsearch(db, rapid_key)
        else:
            logger.info("JSearch skipped — RAPIDAPI_KEY not set in .env")

        logger.info(f"Free collection done — {total} new jobs added")
    except Exception as e:
        logger.error(f"Free collection error: {e}")
    finally:
        db.close()

    return total
