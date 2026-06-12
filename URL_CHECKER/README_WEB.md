# Sitemap URL Health Checker - Web Version

A modern, web-based application for checking the health of URLs extracted from XML sitemaps. Features a beautiful graphical dashboard with real-time updates, interactive charts, and comprehensive analytics.

## v2 Features (June 2026)

- **Password login** — single admin password; change it in Settings on the main page. Generated password is logged on first start (`journalctl -u url-checker | grep "Generated admin password"`).
- **Run history (SQLite)** — every check is saved to `history.db`; kept for **15 days** by default (configurable 1–365 in Settings).
- **Compare runs** — History page diffs any two runs into **New Errors / Fixed / Still Broken / Got Slower** buckets, plus a success-rate & response-time trend chart.
- **Scheduled checks** — enable "Scheduled checks" + interval to re-run automatically.
- **Email alerts** — SMTP settings in the UI; alerts fire on new errors or success rate below threshold. "Send Test Email" button verifies config.
- **Custom URL lists** — paste plain URLs instead of a sitemap.
- **Per-domain rate limit** — optional politeness cap per hostname (0 = full speed).
- **uvloop** — faster asyncio event loop.

## Features

### 🌐 Web Interface
- **Modern, Responsive Design**: Beautiful gradient UI that works on desktop and mobile
- **Real-time Updates**: Live progress tracking using WebSockets
- **Interactive Dashboard**: Visual charts and statistics
- **No Installation Required**: Access via web browser

### 📊 Dashboard Features
- **Status Code Distribution**: Interactive pie chart showing 2xx, 3xx, 4xx, 5xx, and errors
- **Response Time Distribution**: Bar chart showing performance buckets
- **Summary Statistics**: Success rate, average response time, slow URLs count
- **Real-time Updates**: Charts and stats update as URLs are checked

### 🔍 Core Functionality
- Parse sitemap XML files (including sitemapindex)
- Extract URLs from `<loc>` tags
- Async URL health checking with configurable concurrency
- Support for HEAD/GET requests with fallback
- Comprehensive error handling
- Export to CSV, Excel, or JSON

## Requirements

- Python 3.8 or higher
- Modern web browser (Chrome, Firefox, Edge, Safari)

## Installation

### 1. Create Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/Mac:
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements_web.txt
```

### 3. Run the Web Application

```bash
python app_web.py
```

The application will start on `http://localhost:5000`

Open your web browser and navigate to: **http://localhost:5000**

## Usage

### 1. Add Sitemap URLs
- Enter a sitemap URL in the input field (e.g., `https://www.myvi.in/consumer-main-sitemap.xml`)
- Click "Add Sitemap" or press Enter
- Add multiple sitemaps if needed

### 2. Configure Settings
- Adjust timeout, concurrency, retry count
- Configure redirect following, SSL verification
- Set custom User-Agent

### 3. Fetch URLs
- Click "Fetch URLs" to extract all URLs from the sitemap(s)
- Wait for the extraction to complete
- Total URL count will be displayed

### 4. Start Health Check
- Click "Start Health Check" to begin checking URLs
- Watch real-time progress in the dashboard
- Charts and statistics update automatically

### 5. View Results
- **Dashboard Tab**: Visual charts and summary statistics
- **Results Table**: Detailed data with search and filter options
- Color-coded status indicators:
  - 🟢 Green: 2xx (Success)
  - 🟡 Yellow: 3xx (Redirects)
  - 🔴 Red: 4xx/5xx (Errors)

### 6. Export Results
- Click export buttons (CSV, Excel, or JSON)
- Files are automatically downloaded
- Includes metadata and all results

## Web Interface Features

### Real-time Dashboard
- **Status Code Pie Chart**: Visual breakdown of HTTP status codes
- **Response Time Bar Chart**: Distribution of response times
- **Summary Cards**: Key metrics at a glance
- **Live Updates**: All charts update as URLs are checked

### Results Table
- **Search**: Filter URLs by text search
- **Status Filter**: Filter by status category (2xx, 3xx, 4xx, 5xx, Errors)
- **Sortable Columns**: Click headers to sort
- **Color Coding**: Visual status indicators
- **Slow URL Highlighting**: URLs >2000ms highlighted

### Responsive Design
- Works on desktop, tablet, and mobile devices
- Adaptive layout for different screen sizes
- Touch-friendly interface

## API Endpoints

### REST API
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `GET /api/sitemaps` - Get list of sitemap URLs
- `POST /api/sitemaps` - Add a sitemap URL
- `DELETE /api/sitemaps/<index>` - Remove a sitemap URL
- `DELETE /api/sitemaps` - Clear all sitemap URLs
- `GET /api/results` - Get all check results
- `POST /api/export/<format>` - Export results (csv/excel/json)

### WebSocket Events
- `fetch_urls` - Fetch URLs from sitemaps
- `start_check` - Start URL health check
- `stop_check` - Stop URL health check
- `check_progress` - Real-time progress updates
- `check_complete` - Check completion notification

## Project Structure

```
sitemap_url_health_checker/
│
├── app_web.py              # Flask web application
├── core/                    # Core modules (shared with desktop version)
│   ├── sitemap_parser.py
│   ├── url_checker.py
│   ├── exporter.py
│   └── models.py
├── templates/
│   └── index.html          # Main HTML template
├── static/
│   ├── css/
│   │   └── style.css       # Stylesheet
│   └── js/
│       └── app.js          # Frontend JavaScript
├── exports/                # Exported files (auto-created)
├── logs/                   # Application logs
├── requirements_web.txt    # Web dependencies
└── README_WEB.md          # This file
```

## Configuration

Default settings:
- **Timeout**: 10 seconds
- **Max Concurrent**: 20 requests
- **Retry Count**: 2
- **Follow Redirects**: Enabled
- **Verify SSL**: Enabled
- **Use HEAD First**: Enabled
- **User-Agent**: URLHealthChecker/1.0

## Troubleshooting

### Application won't start
- Ensure Python 3.8+ is installed
- Verify all dependencies: `pip install -r requirements_web.txt`
- Check if port 5000 is available
- Review logs in `logs/app_web.log`

### WebSocket connection issues
- Ensure Flask-SocketIO is installed
- Check browser console for errors
- Verify firewall settings allow WebSocket connections

### Charts not displaying
- Check browser console for JavaScript errors
- Ensure Chart.js CDN is accessible
- Try refreshing the page

### Export not working
- Ensure `exports/` directory exists and is writable
- Check browser download settings
- Review server logs for errors

## Differences from Desktop Version

| Feature | Desktop (PySide6) | Web (Flask) |
|---------|------------------|-------------|
| UI Framework | PySide6/Qt | HTML/CSS/JavaScript |
| Charts | QtCharts | Chart.js |
| Real-time Updates | Signals/Slots | WebSockets |
| Access | Local application | Web browser |
| Deployment | Standalone | Server-based |

## Deployment

### Local Network
The application runs on `0.0.0.0:5000` by default, making it accessible on your local network.

### Production Deployment
For production, consider:
- Using a production WSGI server (Gunicorn, uWSGI)
- Setting up reverse proxy (Nginx)
- Using HTTPS with SSL certificates
- Configuring firewall rules
- Setting up process management (systemd, supervisor)

Example with Gunicorn (threading mode — eventlet is broken on Python 3.12, do not use it):
```bash
pip install gunicorn
gunicorn --worker-class gthread --workers 1 --threads 8 --bind 0.0.0.0:5000 app_web:app
```

This server is already deployed as a systemd service:
```bash
systemctl status url-checker    # running on port 5000, auto-starts on boot
systemctl restart url-checker   # after code changes
journalctl -u url-checker -f    # live logs
```

## License

This project is provided as-is for educational and production use.

## Support

For issues or questions:
- Check logs in `logs/app_web.log`
- Review browser console for frontend errors
- Verify all dependencies are installed correctly
