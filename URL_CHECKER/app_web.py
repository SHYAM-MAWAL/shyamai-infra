"""Sitemap URL Health Checker — Flask web edition.

Flask + Socket.IO (threading mode — no eventlet/gevent needed) frontend over
the same async aiohttp engine the desktop app uses. Results stream to the
browser per-URL in real time.

v2: password auth, SQLite run history with compare, scheduled checks,
email alerts, per-domain rate limiting, custom URL lists, uvloop.
"""

import asyncio
import copy
import json
import logging
import secrets
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from flask import (Flask, jsonify, redirect, render_template, request,
                   send_file, session, url_for)
from flask_socketio import SocketIO
from werkzeug.security import check_password_hash, generate_password_hash

from core import alerts, history, schedules as sched_lib
from core.exporter import export_results
from core.models import CheckConfig, UrlResult
from core.sitemap_parser import SitemapParser
from core.url_checker import UrlChecker

try:
    import uvloop
    _run_async = uvloop.run
except ImportError:
    _run_async = asyncio.run

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "config.json"
EXPORT_DIR = BASE_DIR / "exports"
LOG_DIR = BASE_DIR / "logs"

LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "app_web.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("app_web")

app = Flask(__name__)
app.permanent_session_lifetime = timedelta(days=7)
socketio = SocketIO(app, async_mode="threading", cors_allowed_origins="*")

# ---------------------------------------------------------------------------
# Application state (process-local — run with a single worker)
# ---------------------------------------------------------------------------
state_lock = threading.Lock()
app_config = CheckConfig()
sitemap_urls: list[str] = []
extracted_urls: list[str] = []
check_results: list[UrlResult] = []
current_checker: UrlChecker | None = None
busy = False  # a fetch or check is running

DEFAULT_SETTINGS = {
    "retention_days": 15,
    "schedules": [],
    "alerts": {
        "enabled": False,
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_password": "",
        "mail_from": "",
        "mail_to": "",
        "min_success_rate": 90,
    },
}
app_settings = copy.deepcopy(DEFAULT_SETTINGS)
auth_state = {"password_hash": "", "secret_key": ""}


# ---------------------------------------------------------------------------
# Config persistence
# ---------------------------------------------------------------------------
def _merge(dst: dict, src: dict) -> None:
    """Recursively copy known keys from src into dst (unknown keys ignored)."""
    for key, value in src.items():
        if key not in dst:
            continue
        if isinstance(dst[key], dict) and isinstance(value, dict):
            _merge(dst[key], value)
        else:
            dst[key] = value


def load_config() -> None:
    global app_config, sitemap_urls
    data = {}
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Could not load config.json: %s", exc)

    app_config = CheckConfig.from_dict(data.get("config", {}))
    sitemap_urls = [u for u in data.get("sitemap_urls", []) if isinstance(u, str)]
    _merge(app_settings, data.get("settings", {}))

    # migrate v2 interval-only scheduler ({"schedule": {enabled, interval_hours}})
    legacy = data.get("settings", {}).get("schedule")
    if legacy and legacy.get("enabled") and not app_settings["schedules"]:
        app_settings["schedules"].append({
            "id": secrets.token_hex(4), "type": "interval",
            "interval_hours": float(legacy.get("interval_hours", 6)),
            "enabled": True, "last_run": None,
            "created_at": datetime.now().isoformat(timespec="seconds"),
        })
        logger.info("Migrated legacy interval schedule")
    auth_state.update({k: v for k, v in data.get("auth", {}).items()
                       if k in auth_state and isinstance(v, str)})

    if not auth_state["secret_key"]:
        auth_state["secret_key"] = secrets.token_hex(32)
    if not auth_state["password_hash"]:
        password = secrets.token_urlsafe(9)
        auth_state["password_hash"] = generate_password_hash(password)
        logger.warning("Generated admin password: %s  (change it in Settings)", password)
    app.secret_key = auth_state["secret_key"]
    save_config()
    logger.info("Loaded config.json (%d sitemaps)", len(sitemap_urls))


def save_config() -> None:
    try:
        CONFIG_FILE.write_text(
            json.dumps({
                "config": app_config.to_dict(),
                "sitemap_urls": sitemap_urls,
                "settings": app_settings,
                "auth": auth_state,
            }, indent=2),
            encoding="utf-8",
        )
        CONFIG_FILE.chmod(0o600)  # contains password hash + smtp credentials
    except Exception as exc:
        logger.warning("Could not save config.json: %s", exc)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.before_request
def require_login():
    if request.path == "/login" or request.path.startswith("/static/"):
        return None
    if session.get("authed"):
        return None
    if request.path.startswith("/api/"):
        return jsonify({"error": "Authentication required"}), 401
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        password = request.form.get("password", "")
        if password and check_password_hash(auth_state["password_hash"], password):
            session.permanent = True
            session["authed"] = True
            return redirect(url_for("index"))
        time.sleep(1)  # slow down brute force
        return render_template("login.html", error="Wrong password"), 401
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/api/password", methods=["POST"])
def api_password():
    data = request.get_json(force=True) or {}
    current, new = data.get("current", ""), data.get("new", "")
    if not check_password_hash(auth_state["password_hash"], current):
        return jsonify({"error": "Current password is wrong"}), 403
    if len(new) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400
    auth_state["password_hash"] = generate_password_hash(new)
    save_config()
    return jsonify({"ok": True})


@socketio.on("connect")
def on_connect():
    if not session.get("authed"):
        logger.warning("Rejected unauthenticated socket connection")
        return False
    return None


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/history")
def history_page():
    return render_template("history.html")


# ---------------------------------------------------------------------------
# Config / settings API
# ---------------------------------------------------------------------------
@app.route("/api/config", methods=["GET", "POST"])
def api_config():
    global app_config
    if request.method == "POST":
        with state_lock:
            app_config = CheckConfig.from_dict(request.get_json(force=True) or {})
            save_config()
    return jsonify(app_config.to_dict())


@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "POST":
        with state_lock:
            _merge(app_settings, request.get_json(force=True) or {})
            app_settings["retention_days"] = max(1, min(365, int(app_settings["retention_days"])))
            save_config()
    return jsonify(app_settings)


# ---------------------------------------------------------------------------
# Schedules API
# ---------------------------------------------------------------------------
WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _build_schedule(data: dict) -> tuple[dict | None, str | None]:
    """All schedule types share one picked start datetime + a repeat mode."""
    stype = data.get("type")
    now = datetime.now()
    sched = {
        "id": secrets.token_hex(4), "type": stype, "enabled": True,
        "created_at": now.isoformat(timespec="seconds"), "last_run": None,
    }
    try:
        dt = datetime.fromisoformat(data["datetime"])  # from <input datetime-local>
        if dt <= now:
            return None, "Pick a date/time in the future"
        if stype == "once":
            sched["date"] = dt.date().isoformat()
            sched["time"] = dt.strftime("%H:%M")
        elif stype == "daily":
            sched["time"] = dt.strftime("%H:%M")
            sched["start"] = dt.isoformat(timespec="seconds")
        elif stype == "weekly":
            days = sorted({int(d) for d in data.get("days", [])})
            if not days:
                days = [dt.weekday()]  # default: weekday of the picked date
            if not all(0 <= d <= 6 for d in days):
                return None, "Invalid weekday"
            sched["days"] = days
            sched["time"] = dt.strftime("%H:%M")
            sched["start"] = dt.isoformat(timespec="seconds")
        elif stype == "interval":
            hours = float(data.get("interval_hours") or 0)
            if hours < 0.5:
                return None, "Interval must be at least 0.5 hours"
            sched["interval_hours"] = hours
            sched["start"] = dt.isoformat(timespec="seconds")
        else:
            return None, "Unknown schedule type"
    except (KeyError, ValueError, TypeError):
        return None, "Invalid schedule data"
    return sched, None


def _schedules_view() -> list[dict]:
    now = datetime.now()
    out = []
    for s in app_settings["schedules"]:
        d = dict(s)
        nxt = sched_lib.next_run(s, now)
        d["next_run"] = nxt.isoformat(timespec="minutes") if nxt else None
        out.append(d)
    return out


@app.route("/api/schedules", methods=["GET", "POST"])
def api_schedules():
    if request.method == "POST":
        sched, err = _build_schedule(request.get_json(force=True) or {})
        if err:
            return jsonify({"error": err}), 400
        with state_lock:
            app_settings["schedules"].append(sched)
            save_config()
    return jsonify({"schedules": _schedules_view()})


@app.route("/api/schedules/<sid>", methods=["DELETE"])
def api_schedule_delete(sid: str):
    with state_lock:
        before = len(app_settings["schedules"])
        app_settings["schedules"] = [s for s in app_settings["schedules"] if s["id"] != sid]
        if len(app_settings["schedules"]) == before:
            return jsonify({"error": "Schedule not found"}), 404
        save_config()
    return jsonify({"schedules": _schedules_view()})


@app.route("/api/schedules/<sid>/toggle", methods=["POST"])
def api_schedule_toggle(sid: str):
    with state_lock:
        for s in app_settings["schedules"]:
            if s["id"] == sid:
                s["enabled"] = not s["enabled"]
                save_config()
                return jsonify({"schedules": _schedules_view()})
    return jsonify({"error": "Schedule not found"}), 404


# ---------------------------------------------------------------------------
# Sitemaps / custom URL list
# ---------------------------------------------------------------------------
@app.route("/api/sitemaps", methods=["GET", "POST", "DELETE"])
def api_sitemaps():
    if request.method == "POST":
        url = ((request.get_json(force=True) or {}).get("url") or "").strip()
        if not url.lower().startswith(("http://", "https://")):
            return jsonify({"error": "URL must start with http:// or https://"}), 400
        with state_lock:
            if url in sitemap_urls:
                return jsonify({"error": "Sitemap already added"}), 409
            sitemap_urls.append(url)
            save_config()
    elif request.method == "DELETE":
        with state_lock:
            sitemap_urls.clear()
            save_config()
    return jsonify({"sitemaps": sitemap_urls})


@app.route("/api/sitemaps/<int:index>", methods=["DELETE"])
def api_sitemap_delete(index: int):
    with state_lock:
        if 0 <= index < len(sitemap_urls):
            sitemap_urls.pop(index)
            save_config()
            return jsonify({"sitemaps": sitemap_urls})
    return jsonify({"error": "Invalid sitemap index"}), 404


@app.route("/api/urls", methods=["POST"])
def api_custom_urls():
    """Load a pasted plain-text URL list instead of fetching a sitemap."""
    global extracted_urls
    text = (request.get_json(force=True) or {}).get("text", "")
    urls, seen = [], set()
    for line in text.splitlines():
        u = line.strip()
        if u.lower().startswith(("http://", "https://")) and u not in seen:
            seen.add(u)
            urls.append(u)
    if not urls:
        return jsonify({"error": "No valid http(s) URLs found"}), 400
    with state_lock:
        extracted_urls = urls
    return jsonify({"total": len(urls)})


# ---------------------------------------------------------------------------
# Results / export
# ---------------------------------------------------------------------------
@app.route("/api/results")
def api_results():
    with state_lock:
        return jsonify({
            "total_urls": len(extracted_urls),
            "results": [r.to_dict() for r in check_results],
        })


@app.route("/api/export/<fmt>", methods=["POST"])
def api_export(fmt: str):
    if fmt not in ("csv", "excel", "json"):
        return jsonify({"error": f"Unknown format: {fmt}"}), 400
    with state_lock:
        if not check_results:
            return jsonify({"error": "No results to export"}), 400
        results = list(check_results)
    try:
        path = export_results(results, fmt, EXPORT_DIR)
    except Exception as exc:
        logger.exception("Export failed")
        return jsonify({"error": str(exc)}), 500
    return send_file(path, as_attachment=True, download_name=path.name)


# ---------------------------------------------------------------------------
# History API
# ---------------------------------------------------------------------------
@app.route("/api/runs")
def api_runs():
    return jsonify({"runs": history.list_runs()})


@app.route("/api/runs/<int:run_id>")
def api_run_detail(run_id: int):
    run = history.get_run(run_id)
    if not run:
        return jsonify({"error": "Run not found"}), 404
    return jsonify({"run": run, "results": history.get_run_results(run_id)})


@app.route("/api/compare/<int:old_id>/<int:new_id>")
def api_compare(old_id: int, new_id: int):
    comparison = history.compare_runs(old_id, new_id)
    if comparison is None:
        return jsonify({"error": "Run not found"}), 404
    return jsonify(comparison)


@app.route("/api/alerts/test", methods=["POST"])
def api_alert_test():
    cfg = app_settings["alerts"]
    try:
        alerts.send_email(cfg, "URL Checker — test alert",
                          "If you can read this, alert emails are working.")
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


# ---------------------------------------------------------------------------
# Fetch / check pipeline
# ---------------------------------------------------------------------------
def _set_busy(value: bool) -> bool:
    """Atomically flip the busy flag. Returns False if already busy."""
    global busy
    with state_lock:
        if value and busy:
            return False
        busy = value
    return True


def _fetch_urls_blocking(config: CheckConfig) -> int:
    """Fetch sitemap URLs into extracted_urls; emits progress. Returns count."""
    global extracted_urls
    parser = SitemapParser(config)

    def progress(sitemap_url: str, count: int):
        socketio.emit("fetch_progress", {"sitemap": sitemap_url, "url_count": count})

    found = _run_async(parser.fetch_urls(list(sitemap_urls), progress))
    with state_lock:
        extracted_urls = found
    return len(found)


def _check_urls_blocking(urls: list[str], trigger: str) -> int | None:
    """Run a health check, persist it to history, alert if needed. Returns run id."""
    global current_checker
    started_at = datetime.now().isoformat(timespec="seconds")
    checker = UrlChecker(app_config)
    with state_lock:
        check_results.clear()
        current_checker = checker
    socketio.emit("check_started", {"total": len(urls)})

    def progress(result: UrlResult, done: int, total: int):
        with state_lock:
            check_results.append(result)
        socketio.emit("check_progress",
                      {"result": result.to_dict(), "done": done, "total": total})

    results = _run_async(checker.check_urls(urls, progress))
    stopped = checker.stopped
    run_id = history.save_run(results, list(sitemap_urls), started_at,
                              trigger=trigger, stopped=stopped)
    history.purge_old(app_settings["retention_days"])
    socketio.emit("check_complete",
                  {"total": len(results), "stopped": stopped, "run_id": run_id})
    logger.info("Check finished: %d URLs (trigger=%s stopped=%s run=%s)",
                len(results), trigger, stopped, run_id)
    if not stopped:
        _maybe_alert(run_id)
    return run_id


def _maybe_alert(run_id: int) -> None:
    cfg = app_settings["alerts"]
    if not cfg["enabled"]:
        return
    try:
        run = history.get_run(run_id)
        prev_id = history.previous_run_id(run_id)
        comparison = history.compare_runs(prev_id, run_id) if prev_id else None
        new_error_count = len(comparison["new_errors"]) if comparison else 0
        low_success = (run["success_rate"] is not None
                       and run["success_rate"] < float(cfg["min_success_rate"]))
        if new_error_count == 0 and not low_success:
            return
        base_url = f"http://{request.host}" if request else "http://localhost:5000"
        subject, body = alerts.build_alert_body(comparison, run, base_url)
        alerts.send_email(cfg, subject, body)
    except Exception as exc:
        logger.error("Alert email failed: %s", exc)


# ---------------------------------------------------------------------------
# Socket.IO events
# ---------------------------------------------------------------------------
@socketio.on("fetch_urls")
def on_fetch_urls(_data=None):
    if not sitemap_urls:
        socketio.emit("fetch_error", {"error": "Add at least one sitemap URL first"})
        return
    if not _set_busy(True):
        socketio.emit("fetch_error", {"error": "Another operation is already running"})
        return
    socketio.start_background_task(_fetch_task)


def _fetch_task():
    try:
        total = _fetch_urls_blocking(app_config)
        socketio.emit("fetch_complete", {"total": total})
        logger.info("Fetched %d URLs from %d sitemaps", total, len(sitemap_urls))
    except Exception as exc:
        logger.exception("Sitemap fetch failed")
        socketio.emit("fetch_error", {"error": str(exc)})
    finally:
        _set_busy(False)


@socketio.on("start_check")
def on_start_check(_data=None):
    if not extracted_urls:
        socketio.emit("check_error", {"error": "Fetch URLs or load a custom list first"})
        return
    if not _set_busy(True):
        socketio.emit("check_error", {"error": "Another operation is already running"})
        return
    socketio.start_background_task(_check_task, list(extracted_urls))


def _check_task(urls: list[str]):
    try:
        _check_urls_blocking(urls, trigger="manual")
    except Exception as exc:
        logger.exception("URL check failed")
        socketio.emit("check_error", {"error": str(exc)})
    finally:
        _set_busy(False)


@socketio.on("stop_check")
def on_stop_check(_data=None):
    if current_checker is not None:
        current_checker.stop()
        logger.info("Stop requested by client")


# ---------------------------------------------------------------------------
# Scheduler — automatic checks every N hours
# ---------------------------------------------------------------------------
def _scheduler_loop():
    logger.info("Scheduler thread started")
    while True:
        time.sleep(30)
        try:
            if busy or not sitemap_urls:
                continue
            now = datetime.now()
            due = next((s for s in app_settings["schedules"]
                        if sched_lib.is_due(s, now)), None)
            if due is None or not _set_busy(True):
                continue
            try:
                logger.info("Scheduled check starting (schedule %s, type=%s)",
                            due["id"], due["type"])
                with state_lock:
                    due["last_run"] = now.isoformat(timespec="seconds")
                    if due["type"] == "once":
                        due["enabled"] = False  # one-shot: completed
                    save_config()
                total = _fetch_urls_blocking(app_config)
                socketio.emit("fetch_complete", {"total": total})
                if total:
                    _check_urls_blocking(list(extracted_urls), trigger="scheduled")
            finally:
                _set_busy(False)
        except Exception:
            logger.exception("Scheduled run failed")


_scheduler_started = False


def _start_scheduler():
    global _scheduler_started
    if not _scheduler_started:
        _scheduler_started = True
        threading.Thread(target=_scheduler_loop, daemon=True).start()


# ---------------------------------------------------------------------------
history.init_db()
load_config()
_start_scheduler()

if __name__ == "__main__":
    logger.info("Starting Sitemap URL Health Checker on http://0.0.0.0:5000")
    socketio.run(app, host="0.0.0.0", port=5000, debug=False,
                 allow_unsafe_werkzeug=True)
