#!/bin/bash
set -e
cd /root/SHYAMAI_JOBS

echo "=== ShyamAI Jobs Startup ==="

# ─── Backend ──────────────────────────────────────────────────────────────────
echo "[1/3] Setting up Python backend..."
cd backend

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
pip install -q "pydantic[email]" python-dateutil 2>/dev/null || true

# Init DB + admin
python3 - <<'PYEOF'
import sys
sys.path.insert(0, '/root/SHYAMAI_JOBS/backend')
from app.database import engine, Base, SessionLocal
from app.models import User
from app.auth import hash_password
from sqlalchemy import text

Base.metadata.create_all(bind=engine)

# Migrate: add email-verification columns if they don't exist yet
with engine.connect() as conn:
    conn.execute(text("""
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;
    """))
    conn.execute(text("UPDATE users SET is_verified = true WHERE role = 'admin'"))

    # Fix BEFORE DELETE trigger: must RETURN OLD (not NEW) to allow the delete to proceed.
    # RETURN NEW in a DELETE trigger returns NULL which silently cancels all deletes.
    conn.execute(text("""
        CREATE OR REPLACE FUNCTION protect_main_admin() RETURNS TRIGGER AS $fn$
        BEGIN
          IF OLD.email ILIKE 'Admin@shyamai.in' THEN
            IF TG_OP = 'DELETE' THEN
              RAISE EXCEPTION 'Admin@shyamai.in is the main admin and cannot be deleted.';
            END IF;
            IF TG_OP = 'UPDATE' AND NEW.is_active = false THEN
              RAISE EXCEPTION 'Admin@shyamai.in is the main admin and cannot be disabled.';
            END IF;
          END IF;
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql;
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS _trigger_setup (id int);
    """))
    conn.execute(text("""
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE trigger_name = 'trg_protect_main_admin'
              AND event_object_table = 'users'
          ) THEN
            CREATE TRIGGER trg_protect_main_admin
            BEFORE DELETE OR UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION protect_main_admin();
          END IF;
        END $$;
    """))
    conn.commit()

db = SessionLocal()
if not db.query(User).filter(User.email == 'Admin@shyamai.in').first():
    db.add(User(
        email='Admin@shyamai.in',
        password_hash=hash_password('Shyamibm@867100'),
        full_name='Shyam (Admin)',
        role='admin',
        is_verified=True,
    ))
    db.commit()
    print("  Admin created: Admin@shyamai.in / Shyamibm@867100")
else:
    print("  Admin user ready")
db.close()
PYEOF

deactivate
cd ..

# ─── Frontend ─────────────────────────────────────────────────────────────────
echo "[2/3] Building React frontend..."
cd frontend
npm install --silent
npm run build
cd ..

# ─── Start backend ────────────────────────────────────────────────────────────
echo "[3/3] Starting backend server..."
fuser -k 8001/tcp 2>/dev/null || true
sleep 1

cd backend
nohup .venv/bin/uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8001 \
  --workers 2 \
  --log-level info \
  > /tmp/shyamai_jobs.log 2>&1 &

echo $! > /tmp/shyamai_jobs.pid
cd ..

sleep 3
if curl -s http://localhost:8001/api/health > /dev/null 2>&1; then
  echo ""
  echo "✓ ShyamAI Jobs is LIVE!"
  echo ""
  echo "  URL:       http://localhost:8001  (or https://jobs.shyamai.in)"
  echo "  API docs:  http://localhost:8001/docs"
  echo "  Admin:     shyammawalai@gmail.com / ShyamAdmin@2024"
  echo "  Logs:      tail -f /tmp/shyamai_jobs.log"
  echo ""
  echo "  Job collection runs automatically every 6 hours."
  echo "  Trigger manually from Admin → Collect tab."
else
  echo "✗ Startup failed. Check: cat /tmp/shyamai_jobs.log"
fi
