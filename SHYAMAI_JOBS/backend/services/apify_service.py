"""
Apify job collection service.
Verified actors + exact field mappings (tested 2026-05-31):
  - LinkedIn : curious_coder/linkedin-jobs-scraper  (input: urls=[search_url])
  - Indeed   : misceres/indeed-scraper               (input: query/location/country)
  - Naukri   : thirdwatch/naukri-jobs-scraper        (input: startUrls=[naukri_search_url])
"""
import re
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote_plus
from apify_client import ApifyClient

MAX_JOB_AGE_DAYS = 30

def _is_too_old(dt: Optional[datetime]) -> bool:
    if not dt: return False
    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc) - timedelta(days=MAX_JOB_AGE_DAYS)

from app.config import settings
from app.database import SessionLocal
from app.models import Job, ApifyRun

logger = logging.getLogger(__name__)

ACTORS = {
    "linkedin": "curious_coder/linkedin-jobs-scraper",
    "indeed":   "misceres/indeed-scraper",
    "naukri":   "thirdwatch/naukri-jobs-scraper",
}

# (location_label, city_tag, linkedin_location, naukri_slug)
SEARCH_TARGETS = [
    ("Pune",      "Pune",      "Pune, Maharashtra, India",      "pune"),
    ("Mumbai",    "Mumbai",    "Mumbai, Maharashtra, India",     "mumbai"),
    ("Hyderabad", "Hyderabad", "Hyderabad, Telangana, India",   "hyderabad"),
    ("Bangalore", "Bangalore", "Bangalore, Karnataka, India",   "bengaluru"),
]

JOB_CATEGORIES = [
    "Software Engineer",
    "Java Developer",
    "Python Developer",
    "Full Stack Developer",
    "Backend Developer",
    "Frontend Developer",
    "DevOps Engineer",
    "Cloud Engineer",
    "Data Engineer",
    "Data Analyst",
    "AI/ML Engineer",
    "QA Engineer",
]

# ─── URL builders ─────────────────────────────────────────────────────────────

def _linkedin_url(keyword: str, location: str) -> str:
    kw = quote_plus(keyword)
    loc = quote_plus(location)
    # f_TPR=r604800 = posted in last 7 days
    return (
        f"https://www.linkedin.com/jobs/search/?keywords={kw}"
        f"&location={loc}&f_TPR=r604800&sortBy=DD"
    )


def _naukri_url(keyword: str, city_slug: str) -> str:
    # Naukri slug pattern: "python-developer-jobs-in-pune"
    kw_slug = keyword.lower().replace(" ", "-").replace("/", "-")
    return f"https://www.naukri.com/{kw_slug}-jobs-in-{city_slug}"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_date(val) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        from dateutil import parser as dp
        return dp.parse(str(val))
    except Exception:
        return None


def _detect_work_type(text: Optional[str]) -> str:
    if not text:
        return "on-site"
    t = str(text).lower()
    if "remote" in t:
        return "remote"
    if "hybrid" in t:
        return "hybrid"
    return "on-site"


def _map_category(title: Optional[str]) -> Optional[str]:
    if not title:
        return None
    t = title.lower()
    rules = [
        ("java",          "Java Developer"),
        ("python",        "Python Developer"),
        ("full stack",    "Full Stack Developer"),
        ("fullstack",     "Full Stack Developer"),
        ("backend",       "Backend Developer"),
        ("front end",     "Frontend Developer"),
        ("frontend",      "Frontend Developer"),
        ("react",         "Frontend Developer"),
        ("angular",       "Frontend Developer"),
        ("devops",        "DevOps Engineer"),
        ("cloud",         "Cloud Engineer"),
        ("aws",           "Cloud Engineer"),
        ("azure",         "Cloud Engineer"),
        ("data engineer", "Data Engineer"),
        ("data analyst",  "Data Analyst"),
        ("ml engineer",   "AI/ML Engineer"),
        ("machine learn", "AI/ML Engineer"),
        ("ai engineer",   "AI/ML Engineer"),
        ("dba",           "Database Administrator"),
        ("database adm",  "Database Administrator"),
        ("sysadmin",      "System Administrator"),
        ("qa",            "QA Engineer"),
        ("test engineer", "QA Engineer"),
        ("quality",       "QA Engineer"),
    ]
    for key, cat in rules:
        if key in t:
            return cat
    return "Software Engineer"


def _clean_skills(val) -> list[str]:
    if not val:
        return []
    if isinstance(val, list):
        return [str(s).strip() for s in val if s]
    return [s.strip() for s in str(val).replace("[", "").replace("]", "").replace("'", "").split(",") if s.strip()]


def _save_run(db, actor_id, source, query, new, dupes, error=None, apify_run_id=None):
    run = ApifyRun(
        run_id=apify_run_id,
        actor_id=actor_id,
        source=source,
        search_query=query,
        status="failed" if error else "completed",
        jobs_collected=new + dupes,
        jobs_new=new,
        jobs_duplicate=dupes,
        error_message=str(error)[:500] if error else None,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()


# ─── LinkedIn ─────────────────────────────────────────────────────────────────

def collect_linkedin(client, db, keyword: str, city: str, linkedin_location: str) -> tuple[int, int]:
    query = f"{keyword} – {city}"
    run_record = ApifyRun(actor_id=ACTORS["linkedin"], source="linkedin",
                          search_query=query, status="running")
    db.add(run_record); db.commit()

    new_count = dupe_count = 0
    try:
        run = client.actor(ACTORS["linkedin"]).call(run_input={
            "urls": [_linkedin_url(keyword, linkedin_location)],
            "maxResults": 25,
        }, timeout_secs=180, memory_mbytes=256)

        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            job_id = str(item.get("id") or "")
            if not job_id:
                continue

            if _is_too_old(parse_date(item.get("postedAt") or item.get("date"))):
                dupe_count += 1; continue

            if db.query(Job).filter(Job.source == "linkedin",
                                    Job.source_job_id == job_id).first():
                dupe_count += 1; continue

            wt_raw = item.get("workplaceTypes") or item.get("workRemoteAllowed")
            work_type = "remote" if item.get("workRemoteAllowed") else _detect_work_type(str(wt_raw))

            skills_raw = item.get("skills") or []

            db.add(Job(
                title=item.get("title") or "Unknown",
                company_name=item.get("companyName") or "Unknown",
                description=(item.get("descriptionText") or item.get("descriptionHtml") or "")[:10000],
                skills=_clean_skills(skills_raw),
                location=item.get("location") or linkedin_location,
                city=city,
                work_type=work_type,
                job_type=(item.get("employmentType") or "full-time").lower().replace(" ", "-"),
                salary_text=str(item.get("salary") or "") or None,
                category=_map_category(item.get("title")),
                source="linkedin",
                source_url=item.get("link") or item.get("applyUrl"),
                source_job_id=job_id,
                posted_date=_parse_date(item.get("postedAt")),
                automation_status="IN_PROGRESS",
                raw_data={k: v for k, v in item.items() if k not in ("descriptionHtml",)},
                apify_run_id=run.get("id"),
            ))
            new_count += 1

        db.commit()
        run_record.status = "completed"
        run_record.jobs_collected = new_count + dupe_count
        run_record.jobs_new = new_count
        run_record.jobs_duplicate = dupe_count
        run_record.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"LinkedIn [{city}/{keyword}]: +{new_count} new, {dupe_count} dupes")
    except Exception as e:
        logger.error(f"LinkedIn error [{city}/{keyword}]: {e}")
        run_record.status = "failed"
        run_record.error_message = str(e)[:500]
        run_record.completed_at = datetime.now(timezone.utc)
        db.commit()

    return new_count, dupe_count


# ─── Indeed ───────────────────────────────────────────────────────────────────

def collect_indeed(client, db, keyword: str, city: str, linkedin_location: str) -> tuple[int, int]:
    query = f"{keyword} – {city}"
    run_record = ApifyRun(actor_id=ACTORS["indeed"], source="indeed",
                          search_query=query, status="running")
    db.add(run_record); db.commit()

    new_count = dupe_count = 0
    try:
        run = client.actor(ACTORS["indeed"]).call(run_input={
            "query": keyword,
            "location": city,
            "country": "IN",
            "maxItems": 25,
        }, timeout_secs=180, memory_mbytes=256)

        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            job_id = str(item.get("id") or item.get("url") or "")
            if not job_id:
                continue

            if _is_too_old(parse_date(item.get("postingDateParsed") or item.get("postedAt"))):
                dupe_count += 1; continue

            if db.query(Job).filter(Job.source == "indeed",
                                    Job.source_job_id == job_id).first():
                dupe_count += 1; continue

            jt_raw = item.get("jobType") or []
            job_type = "full-time"
            if isinstance(jt_raw, list) and jt_raw:
                job_type = jt_raw[0].lower().replace(" ", "-")
            elif isinstance(jt_raw, str):
                job_type = jt_raw.lower().replace(" ", "-")

            db.add(Job(
                title=item.get("positionName") or "Unknown",
                company_name=item.get("company") or "Unknown",
                description=(item.get("description") or item.get("descriptionHTML") or "")[:10000],
                skills=[],
                location=item.get("location") or city,
                city=city,
                work_type=_detect_work_type(item.get("location")),
                job_type=job_type,
                salary_text=str(item.get("salary") or "") or None,
                category=_map_category(item.get("positionName")),
                source="indeed",
                source_url=item.get("url"),
                source_job_id=job_id,
                posted_date=_parse_date(item.get("postingDateParsed") or item.get("postedAt")),
                automation_status="IN_PROGRESS",
                raw_data=item,\n                    automation_status="IN_PROGRESS",\n                    apify_run_id=run.get("id"),
            ))
            new_count += 1

        db.commit()
        run_record.status = "completed"
        run_record.jobs_collected = new_count + dupe_count
        run_record.jobs_new = new_count
        run_record.jobs_duplicate = dupe_count
        run_record.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Indeed [{city}/{keyword}]: +{new_count} new, {dupe_count} dupes")
    except Exception as e:
        logger.error(f"Indeed error [{city}/{keyword}]: {e}")
        run_record.status = "failed"
        run_record.error_message = str(e)[:500]
        run_record.completed_at = datetime.now(timezone.utc)
        db.commit()

    return new_count, dupe_count


# ─── Naukri ───────────────────────────────────────────────────────────────────

def collect_naukri(client, db, keyword: str, city: str, naukri_slug: str) -> tuple[int, int]:
    query = f"{keyword} – {city}"
    run_record = ApifyRun(actor_id=ACTORS["naukri"], source="naukri",
                          search_query=query, status="running")
    db.add(run_record); db.commit()

    new_count = dupe_count = 0
    try:
        naukri_url = _naukri_url(keyword, naukri_slug)
        run = client.actor(ACTORS["naukri"]).call(run_input={
            "startUrls": [{"url": naukri_url}],
            "maxItems": 25,
        }, timeout_secs=180, memory_mbytes=512)

        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            job_id = str(item.get("apply_url") or item.get("title") or "")
            if not job_id:
                continue

            if _is_too_old(parse_date(item.get("posted_at") or item.get("posted_date"))):
                dupe_count += 1; continue

            if db.query(Job).filter(Job.source == "naukri",
                                    Job.source_job_id == job_id).first():
                dupe_count += 1; continue

            # Naukri gives salary_min/salary_max already parsed (in Lakhs)
            sal_min = item.get("salary_min")
            sal_max = item.get("salary_max")
            if sal_min:
                try: sal_min = int(float(sal_min))
                except: sal_min = None
            if sal_max:
                try: sal_max = int(float(sal_max))
                except: sal_max = None

            db.add(Job(
                title=item.get("title") or "Unknown",
                company_name=item.get("company_name") or "Unknown",
                description=(item.get("description") or "")[:10000],
                skills=_clean_skills(item.get("skills")),
                location=item.get("location") or city,
                city=city,
                work_type=_detect_work_type(item.get("location")),
                job_type="full-time",
                experience_min=None,
                experience_max=None,
                salary_min=sal_min,
                salary_max=sal_max,
                salary_currency="INR",
                salary_text=item.get("salary_raw"),
                category=_map_category(item.get("title")),
                source="naukri",
                source_url=item.get("apply_url"),
                source_job_id=job_id,
                posted_date=_parse_date(item.get("posted_at") or item.get("posted_date")),
                automation_status="IN_PROGRESS",
                raw_data=item,\n                    automation_status="IN_PROGRESS",\n                    apify_run_id=run.get("id"),
            ))
            new_count += 1

        db.commit()
        run_record.status = "completed"
        run_record.jobs_collected = new_count + dupe_count
        run_record.jobs_new = new_count
        run_record.jobs_duplicate = dupe_count
        run_record.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Naukri [{city}/{keyword}]: +{new_count} new, {dupe_count} dupes")
    except Exception as e:
        logger.error(f"Naukri error [{city}/{keyword}]: {e}")
        run_record.status = "failed"
        run_record.error_message = str(e)[:500]
        run_record.completed_at = datetime.now(timezone.utc)
        db.commit()

    return new_count, dupe_count


# ─── Orchestrator ─────────────────────────────────────────────────────────────

def collect_jobs_background(source: str = "all"):
    if not settings.APIFY_API_TOKEN:
        logger.warning("Apify token not set — skipping")
        return

    client = ApifyClient(settings.APIFY_API_TOKEN)
    db = SessionLocal()
    total_new = 0

    try:
        # Pune + Mumbai (priority) × first 5 categories per run
        targets = SEARCH_TARGETS[:2]
        keywords = JOB_CATEGORIES[:5]

        for loc_label, city, linkedin_loc, naukri_slug in targets:
            for kw in keywords:
                logger.info(f"Collecting: {kw} in {city}")
                try:
                    if source in ("all", "linkedin"):
                        n, _ = collect_linkedin(client, db, kw, city, linkedin_loc)
                        total_new += n
                    if source in ("all", "indeed"):
                        n, _ = collect_indeed(client, db, kw, city, linkedin_loc)
                        total_new += n
                    if source in ("all", "naukri"):
                        n, _ = collect_naukri(client, db, kw, city, naukri_slug)
                        total_new += n
                except Exception as e:
                    logger.error(f"Error collecting {kw}/{city}: {e}")

        logger.info(f"Collection complete — {total_new} new jobs added")
    except Exception as e:
        logger.error(f"Orchestrator error: {e}")
    finally:
        db.close()
