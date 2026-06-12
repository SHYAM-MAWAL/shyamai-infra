"""Email alerts — sent after a run when new errors appear or success rate drops."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def send_email(alert_cfg: dict, subject: str, body: str) -> None:
    """Send via the SMTP settings in alert_cfg. Raises on failure."""
    host = alert_cfg.get("smtp_host", "")
    port = int(alert_cfg.get("smtp_port") or 587)
    user = alert_cfg.get("smtp_user", "")
    password = alert_cfg.get("smtp_password", "")
    mail_to = alert_cfg.get("mail_to", "")
    mail_from = alert_cfg.get("mail_from") or user or "url-checker@localhost"

    if not host or not mail_to:
        raise ValueError("SMTP host and recipient email are required")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = mail_from
    msg["To"] = mail_to
    msg.set_content(body)

    if port == 465:
        smtp = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        smtp = smtplib.SMTP(host, port, timeout=20)
    with smtp:
        if port != 465:
            try:
                smtp.starttls()
            except smtplib.SMTPNotSupportedError:
                pass  # plain SMTP server (e.g. internal relay)
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)
    logger.info("Alert email sent to %s: %s", mail_to, subject)


def build_alert_body(comparison: dict, run: dict, base_url: str) -> tuple[str, str]:
    """Build (subject, body) from a run + comparison against the previous run."""
    new_errors = comparison["new_errors"] if comparison else []
    fixed = comparison["fixed"] if comparison else []
    subject = (f"URL Checker: {len(new_errors)} new error(s), "
               f"success {run['success_rate']}%")

    lines = [
        f"Run #{run['id']} finished at {run['finished_at']}",
        f"Total URLs: {run['total']}  |  Success rate: {run['success_rate']}%  |  "
        f"Avg response: {run['avg_ms']} ms",
        "",
    ]
    if new_errors:
        lines.append(f"NEW ERRORS ({len(new_errors)}):")
        for e in new_errors[:20]:
            status = e["new_status"] if e["new_status"] is not None else e["error"]
            lines.append(f"  [{status}] {e['url']}")
        if len(new_errors) > 20:
            lines.append(f"  … and {len(new_errors) - 20} more")
        lines.append("")
    if fixed:
        lines.append(f"Fixed since last run: {len(fixed)}")
        lines.append("")
    lines.append(f"Full history: {base_url}/history")
    return subject, "\n".join(lines)
