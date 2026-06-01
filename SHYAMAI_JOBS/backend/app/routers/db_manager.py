"""
Admin DB Manager — full CRUD + raw SQL query runner.
All endpoints require admin JWT.
Also exposes /n8n/* endpoints for automation status updates (API-key auth).
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Any, Optional
from ..database import get_db
from ..auth import require_admin
from ..config import settings

router = APIRouter(prefix="/admin/db", tags=["db-manager"])

AUTOMATION_STATUSES = ["IN_PROGRESS", "PROCESSING", "SENT", "COMPLETED", "FAILED", "SKIPPED"]
PROTECTED_ADMIN = "Admin@shyamai.in"   # this account can never be disabled or deleted


# ─── Schemas ─────────────────────────────────────────────────────────────────

class QueryPayload(BaseModel):
    sql: str


class RowUpdate(BaseModel):
    data: dict[str, Any]


# ─── Tables list ─────────────────────────────────────────────────────────────

@router.get("/tables")
def list_tables(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(text("""
        SELECT
            t.table_name,
            (SELECT COUNT(*) FROM information_schema.columns c
             WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS col_count,
            pg_total_relation_size(quote_ident(t.table_name))::bigint AS size_bytes
        FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name
    """)).fetchall()

    tables = []
    for row in rows:
        try:
            count = db.execute(text(f'SELECT COUNT(*) FROM "{row[0]}"')).scalar()
        except Exception:
            count = 0
        tables.append({
            "name": row[0],
            "columns": row[1],
            "rows": count,
            "size_bytes": row[2],
        })
    return tables


# ─── Table schema + data ─────────────────────────────────────────────────────

@router.get("/tables/{table}")
def get_table(
    table: str,
    page: int = 1,
    per_page: int = 50,
    search: str = "",
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    # Validate table name (only alphanumeric + underscore)
    if not table.replace("_", "").isalnum():
        raise HTTPException(400, "Invalid table name")

    # Schema
    cols = db.execute(text("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t
        ORDER BY ordinal_position
    """), {"t": table}).fetchall()

    if not cols:
        raise HTTPException(404, "Table not found")

    columns = [{"name": r[0], "type": r[1], "nullable": r[2], "default": r[3]} for r in cols]
    col_names = [c["name"] for c in columns]

    # Primary key
    pk_row = db.execute(text("""
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = :t AND tc.table_schema = 'public'
        LIMIT 1
    """), {"t": table}).fetchone()
    pk = pk_row[0] if pk_row else "id"

    # Total count
    total = db.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()

    # Data with pagination
    offset = (page - 1) * per_page
    rows = db.execute(text(
        f'SELECT * FROM "{table}" ORDER BY 1 LIMIT :lim OFFSET :off'
    ), {"lim": per_page, "off": offset}).fetchall()

    import math
    return {
        "table": table,
        "columns": columns,
        "primary_key": pk,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": math.ceil(total / per_page) if total else 0,
        "rows": [dict(zip(col_names, row)) for row in rows],
    }


# ─── Update row ──────────────────────────────────────────────────────────────

@router.put("/tables/{table}/{row_id}")
def update_row(
    table: str,
    row_id: str,
    payload: RowUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    if not table.replace("_", "").isalnum():
        raise HTTPException(400, "Invalid table name")

    pk_row = db.execute(text("""
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = :t AND tc.table_schema = 'public'
        LIMIT 1
    """), {"t": table}).fetchone()
    pk = pk_row[0] if pk_row else "id"

    if not payload.data:
        raise HTTPException(400, "No data provided")

    # Remove pk from update data
    update_data = {k: v for k, v in payload.data.items() if k != pk}
    if not update_data:
        raise HTTPException(400, "Nothing to update")

    set_clause = ", ".join([f'"{k}" = :{k}' for k in update_data.keys()])
    params = {**update_data, "__pk_val": row_id}

    db.execute(text(f'UPDATE "{table}" SET {set_clause} WHERE "{pk}" = :__pk_val'), params)
    db.commit()
    return {"message": f"Row updated in {table}"}


# ─── Delete row ──────────────────────────────────────────────────────────────

@router.delete("/tables/{table}/{row_id}")
def delete_row(
    table: str,
    row_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    if not table.replace("_", "").isalnum():
        raise HTTPException(400, "Invalid table name")

    pk_row = db.execute(text("""
        SELECT kcu.column_name FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = :t AND tc.table_schema = 'public' LIMIT 1
    """), {"t": table}).fetchone()
    pk = pk_row[0] if pk_row else "id"

    db.execute(text(f'DELETE FROM "{table}" WHERE "{pk}" = :id'), {"id": row_id})
    db.commit()
    return {"message": f"Row deleted from {table}"}


# ─── Raw SQL query ────────────────────────────────────────────────────────────

@router.post("/query")
def run_query(payload: QueryPayload, db: Session = Depends(get_db), _=Depends(require_admin)):
    sql = payload.sql.strip()
    if not sql:
        raise HTTPException(400, "Empty query")

    try:
        result = db.execute(text(sql))

        # SELECT-like queries return rows
        if result.returns_rows:
            cols = list(result.keys())
            rows = result.fetchmany(500)   # cap at 500 rows for safety
            db.commit()
            return {
                "type": "select",
                "columns": cols,
                "rows": [dict(zip(cols, row)) for row in rows],
                "count": len(rows),
            }
        else:
            db.commit()
            return {
                "type": "modify",
                "affected": result.rowcount,
                "message": f"{result.rowcount} row(s) affected",
            }
    except Exception as e:
        db.rollback()
        raise HTTPException(400, str(e))


# ─── n8n Automation Status endpoints ─────────────────────────────────────────
# Auth: Bearer token = APIFY_API_TOKEN (reuse existing secret, or set N8N_SECRET in .env)

class AutomationUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


def _verify_n8n_token(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "").strip()
    if token != settings.APIFY_API_TOKEN and token != getattr(settings, "N8N_SECRET", ""):
        raise HTTPException(401, "Invalid n8n token")


@router.put("/n8n/jobs/{job_id}/status")
def update_automation_status(
    job_id: str,
    payload: AutomationUpdate,
    db: Session = Depends(get_db),
    _=Depends(_verify_n8n_token),
):
    """Called by n8n to update a job's automation_status."""
    if payload.status not in AUTOMATION_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of: {AUTOMATION_STATUSES}")

    result = db.execute(
        text("UPDATE jobs SET automation_status = :s, updated_at = NOW() WHERE id::text = :id"),
        {"s": payload.status, "id": job_id}
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Job not found")
    db.commit()
    return {"job_id": job_id, "automation_status": payload.status}


@router.post("/n8n/jobs/bulk-status")
def bulk_update_automation_status(
    updates: list[AutomationUpdate],
    job_ids: list[str],
    db: Session = Depends(get_db),
    _=Depends(_verify_n8n_token),
):
    """Bulk update automation_status for multiple jobs."""
    if len(job_ids) != len(updates):
        raise HTTPException(400, "job_ids and updates must have same length")

    updated = 0
    for job_id, upd in zip(job_ids, updates):
        if upd.status not in AUTOMATION_STATUSES:
            continue
        r = db.execute(
            text("UPDATE jobs SET automation_status = :s, updated_at = NOW() WHERE id::text = :id"),
            {"s": upd.status, "id": job_id}
        )
        updated += r.rowcount
    db.commit()
    return {"updated": updated}


@router.get("/n8n/jobs/pending")
def get_pending_jobs(
    limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(_verify_n8n_token),
):
    """n8n polls this to get jobs that need processing (IN_PROGRESS)."""
    rows = db.execute(text("""
        SELECT id, title, company_name, city, source, source_url,
               category, skills, posted_date, automation_status, created_at
        FROM jobs
        WHERE automation_status = 'IN_PROGRESS'
          AND is_active = true AND is_expired = false
          AND COALESCE(posted_date, created_at) >= NOW() - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT :lim
    """), {"lim": limit}).fetchall()

    cols = ["id","title","company_name","city","source","source_url",
            "category","skills","posted_date","automation_status","created_at"]
    return {"count": len(rows), "jobs": [dict(zip(cols, r)) for r in rows]}


# ─── Admin: Users management ──────────────────────────────────────────────────

@router.get("/users")
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(text("""
        SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.is_verified, u.created_at,
               COUNT(s.id) as saved_count
        FROM users u
        LEFT JOIN saved_jobs s ON s.user_id = u.id
        GROUP BY u.id ORDER BY u.created_at DESC
    """)).fetchall()
    cols = ["id","email","full_name","role","is_active","is_verified","created_at","saved_count"]
    return [dict(zip(cols, r)) for r in rows]


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


def _get_user_email(db: Session, user_id: str) -> str:
    row = db.execute(text("SELECT email FROM users WHERE id::text = :id"), {"id": user_id}).fetchone()
    return row[0] if row else ""


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    email = _get_user_email(db, user_id)

    # Block disabling the protected admin
    if email.lower() == PROTECTED_ADMIN.lower() and payload.is_active is False:
        raise HTTPException(403, f"{PROTECTED_ADMIN} is the main admin and cannot be disabled.")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")

    set_clause = ", ".join([f"{k} = :{k}" for k in updates])
    params = {**updates, "uid": user_id}
    db.execute(text(f"UPDATE users SET {set_clause}, updated_at = NOW() WHERE id::text = :uid"), params)
    db.commit()
    return {"message": "User updated"}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    email = _get_user_email(db, user_id)

    if email.lower() == PROTECTED_ADMIN.lower():
        raise HTTPException(403, f"{PROTECTED_ADMIN} is the main admin and cannot be deleted.")

    db.execute(text("DELETE FROM users WHERE id::text = :id"), {"id": user_id})
    db.commit()
    return {"message": "User deleted"}


# ─── Admin: Saved Jobs management ─────────────────────────────────────────────

@router.get("/saved-jobs")
def list_saved_jobs(
    page: int = 1,
    per_page: int = 50,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    import math
    total = db.execute(text("SELECT COUNT(*) FROM saved_jobs")).scalar()
    rows = db.execute(text("""
        SELECT s.id, u.email, u.full_name,
               j.title, j.company_name, j.city, j.source,
               s.created_at
        FROM saved_jobs s
        JOIN users u ON u.id = s.user_id
        JOIN jobs j ON j.id = s.job_id
        ORDER BY s.created_at DESC
        LIMIT :lim OFFSET :off
    """), {"lim": per_page, "off": (page - 1) * per_page}).fetchall()

    cols = ["id","email","full_name","job_title","company_name","city","source","saved_at"]
    return {
        "total": total,
        "page": page,
        "total_pages": math.ceil(total / per_page) if total else 0,
        "rows": [dict(zip(cols, r)) for r in rows],
    }


@router.delete("/saved-jobs/{saved_id}")
def delete_saved_job(saved_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    db.execute(text("DELETE FROM saved_jobs WHERE id::text = :id"), {"id": saved_id})
    db.commit()
    return {"message": "Saved job removed"}
