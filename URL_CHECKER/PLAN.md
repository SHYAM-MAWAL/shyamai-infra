# Flask Web App — Linux Deployment Plan
## Sitemap URL Health Checker (Web Edition)

---

## Current State — What Already Exists

The web version is **90% built** inside this repo. You do NOT start from scratch.

| File | Status | Notes |
|---|---|---|
| `app_web.py` | EXISTS — complete | Flask + Socket.IO backend, all routes wired |
| `templates/index.html` | EXISTS — complete | Full HTML UI with all sections |
| `static/css/style.css` | EXISTS — complete | Responsive design, mobile-friendly |
| `static/js/app.js` | EXISTS — complete | Real-time Socket.IO client, charts, export |
| `core/url_checker.py` | EXISTS — reused as-is | Same async aiohttp engine, same speed |
| `core/sitemap_parser.py` | EXISTS — reused as-is | Same concurrency (50 concurrent fetches) |
| `core/exporter.py` | EXISTS — reused as-is | CSV / Excel / JSON export |
| `core/models.py` | EXISTS — reused as-is | All data models |
| `requirements_web.txt` | EXISTS | Needs one fix (see below) |

**What is missing / needs fixing:** 5 specific items listed below.

---

## What Needs to Be Done

### Fix 1 — `requirements_web.txt` (broken dependency)

`eventlet` conflicts with `asyncio` on Python 3.12+ and modern Linux.
Replace it with `gevent` or drop it entirely and use threading mode.

**Current (broken on Linux Python 3.12):**
```
eventlet>=0.33.0
```

**Replace with:**
```
gevent>=23.9.0
gevent-websocket>=0.10.1
```

**OR** just remove `eventlet` entirely — `app_web.py` already uses
`async_mode='threading'` which works without eventlet/gevent on Linux.

---

### Fix 2 — `app_web.py` Line 127 (broken import)

This line crashes on startup:
```python
import flask
request_context = flask._request_ctx_stack.top   # line 127 — removed in Flask 3.x
```

Delete those 2 lines entirely. They are unused — the thread already
runs without needing the request context.

---

### Fix 3 — `app_web.py` — Persist config to disk

Currently sitemap URLs and settings reset on every server restart.
Add `config.json` read/write (same format as the desktop app uses)
so settings survive restarts.

**Where:** Add `load_config()` and `save_config()` calls matching
the desktop `main_window.py` pattern — read on startup, write on
every sitemap add/remove and config change.

---

### Fix 4 — `static/js/app.js` — Copy URL feature

The web results table has no right-click / copy support.
Add a context menu on table rows:
- **Copy URL** — copies column 0 to clipboard
- **Copy Row** — copies all columns tab-separated
- **Open in Browser** — `window.open(url, '_blank')`

Use the browser `navigator.clipboard.writeText()` API (works in
all modern browsers on localhost and HTTPS).

---

### Fix 5 — `templates/index.html` — Slow URLs + Error URLs tables

The desktop dashboard has "Top 10 Slowest URLs" and "Error URLs"
tables. The web dashboard is missing these. Add them below the charts
inside the Dashboard section.

Populate them from the existing `results` JS array after each
`check_progress` or `check_complete` event — no backend change needed.

---

## Linux Setup — Step by Step

### 1. System Requirements

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install python3.11 python3.11-venv python3-pip git -y

# Fedora / RHEL
sudo dnf install python3.11 python3.11-devel git -y
```

Python 3.10, 3.11, or 3.12 all work. Avoid 3.9 (aiohttp 3.9+ requires 3.10+).

---

### 2. Clone / Copy Project

```bash
# Copy your project to Linux (scp, git, USB, etc.)
scp -r "URL CHECKER CURSOR/" user@linux-host:~/url-checker/

# OR if using git
git clone <your-repo-url> url-checker
cd url-checker
```

---

### 3. Create Virtual Environment

```bash
cd ~/url-checker
python3.11 -m venv venv
source venv/bin/activate
```

---

### 4. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements_web.txt
```

If lxml fails to build:
```bash
sudo apt install libxml2-dev libxslt-dev -y   # Debian/Ubuntu
sudo dnf install libxml2-devel libxslt-devel -y  # Fedora
pip install lxml
```

---

### 5. Run in Development Mode

```bash
source venv/bin/activate
python app_web.py
```

Open browser at: `http://localhost:5000`

---

### 6. Run in Production (Gunicorn)

```bash
pip install gunicorn
gunicorn --worker-class geventwebsocket.gunicorn.workers.GeventWebSocketWorker \
         --workers 1 \
         --bind 0.0.0.0:5000 \
         app_web:app
```

**Why 1 worker?** The in-memory result store (`check_results`, `extracted_urls`)
is process-local. Multiple workers = each worker has its own copy = race conditions
and lost results. Use 1 worker for now.

**Alternative (simpler, threading mode):**
```bash
gunicorn --worker-class gthread \
         --workers 1 \
         --threads 8 \
         --bind 0.0.0.0:5000 \
         app_web:app
```

---

### 7. Run as a Systemd Service (auto-start on boot)

Create `/etc/systemd/system/url-checker.service`:

```ini
[Unit]
Description=Sitemap URL Health Checker
After=network.target

[Service]
User=youruser
WorkingDirectory=/home/youruser/url-checker
ExecStart=/home/youruser/url-checker/venv/bin/gunicorn \
          --worker-class gthread \
          --workers 1 \
          --threads 8 \
          --bind 0.0.0.0:5000 \
          app_web:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable url-checker
sudo systemctl start url-checker
sudo systemctl status url-checker
```

---

### 8. Nginx Reverse Proxy (optional — for port 80/443)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";   # required for WebSocket/Socket.IO
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/url-checker
sudo ln -s /etc/nginx/sites-available/url-checker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Architecture — How It Works

```
Browser
  │  HTTP GET /          → serves index.html
  │  WebSocket (Socket.IO)
  │    emit fetch_urls   → SitemapParser (aiohttp, 50 concurrent)
  │    emit start_check  → UrlChecker   (aiohttp, 20 concurrent)
  │    on  check_progress ← result streamed per URL in real-time
  │  HTTP POST /api/export/csv → download file
  ▼
Flask app_web.py
  │
  ├── core/sitemap_parser.py   (unchanged from desktop)
  ├── core/url_checker.py      (unchanged from desktop)
  ├── core/exporter.py         (unchanged from desktop)
  └── core/models.py           (unchanged from desktop)
```

Real-time updates use **Socket.IO** (WebSocket with fallback to polling).
Each URL result is pushed to the browser as it completes — same as the
desktop Qt Signals model, just over a socket instead.

---

## Estimated Time to Production

| Task | Time |
|---|---|
| Fix 2 broken items in `app_web.py` (Fix 1 + Fix 2) | 15 min |
| Add config persistence (Fix 3) | 30 min |
| Add copy/context menu in JS (Fix 4) | 30 min |
| Add slow/error URL tables in HTML+JS (Fix 5) | 45 min |
| Linux setup + test | 30 min |
| **Total** | **~2.5 hours** |

---

## What Does NOT Change for Linux

- All of `core/` — zero changes needed
- `templates/index.html` — only Fix 5 addition
- `static/css/style.css` — zero changes needed
- `static/js/app.js` — only Fix 4 addition
- The URL checking speed, concurrency, and accuracy — identical to desktop

---

## Multi-User Note

If multiple people use the web app simultaneously, they share the same
global `check_results` list — one user's check overwrites another's.

For a personal/team tool this is fine. For public multi-user deployment,
the fix is to key results by session ID using Flask sessions or a per-connection
Socket.IO room — a separate enhancement, not needed for the basic Linux port.
