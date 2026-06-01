import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

_SMTP_HOST = "mail.shyamai.cloud"
_SMTP_PORT = 465
_SMTP_USER = "admin@shyamai.in"
_SMTP_PASS = "Shyamibm@867100"
_FROM = "ShyamAI Jobs <admin@shyamai.in>"
_BASE_URL = "https://jobs.shyamai.in"


def send_verification_email(to_email: str, full_name: str, token: str):
    name = full_name or to_email.split("@")[0]
    link = f"{_BASE_URL}/verify-email?token={token}"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff;border-radius:12px">
      <div style="text-align:center;margin-bottom:28px">
        <div style="display:inline-block;background:#2563eb;border-radius:12px;padding:10px 20px">
          <span style="color:#fff;font-size:18px;font-weight:700">ShyamAI Jobs</span>
        </div>
      </div>
      <h2 style="color:#111827;font-size:22px;margin-bottom:8px">Verify your email address</h2>
      <p style="color:#6b7280;line-height:1.6;margin-bottom:28px">
        Hi <strong>{name}</strong>,<br/>
        Thanks for registering! Click the button below to verify your email and activate your account.
      </p>
      <div style="text-align:center;margin-bottom:28px">
        <a href="{link}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px">
          Verify Email Address
        </a>
      </div>
      <p style="color:#9ca3af;font-size:13px;margin-bottom:4px">Or copy this link into your browser:</p>
      <p style="color:#6b7280;font-size:12px;word-break:break-all;background:#f9fafb;padding:8px 12px;border-radius:6px">{link}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0"/>
      <p style="color:#9ca3af;font-size:12px;margin:0">
        This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.
      </p>
      <p style="color:#d1d5db;font-size:11px;text-align:center;margin-top:20px">© 2024 ShyamAI Jobs · IT Jobs in India</p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Verify your ShyamAI Jobs account"
    msg["From"] = _FROM
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL(_SMTP_HOST, _SMTP_PORT) as server:
        server.login(_SMTP_USER, _SMTP_PASS)
        server.sendmail(_SMTP_USER, to_email, msg.as_string())


def send_account_approved_email(to_email: str, full_name: str):
    name = full_name or to_email.split("@")[0]
    login_link = f"{_BASE_URL}/login"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff;border-radius:12px">
      <div style="text-align:center;margin-bottom:28px">
        <div style="display:inline-block;background:#2563eb;border-radius:12px;padding:10px 20px">
          <span style="color:#fff;font-size:18px;font-weight:700">ShyamAI Jobs</span>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-block;background:#dcfce7;border-radius:50%;padding:16px">
          <span style="font-size:32px">✓</span>
        </div>
      </div>
      <h2 style="color:#111827;font-size:22px;margin-bottom:8px;text-align:center">Your account is approved!</h2>
      <p style="color:#6b7280;line-height:1.6;margin-bottom:28px;text-align:center">
        Hi <strong>{name}</strong>,<br/>
        Your ShyamAI Jobs account has been verified by our team. You can now sign in and start applying for IT jobs.
      </p>
      <div style="text-align:center;margin-bottom:28px">
        <a href="{login_link}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px">
          Sign In Now
        </a>
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0"/>
      <p style="color:#d1d5db;font-size:11px;text-align:center;margin:0">© 2024 ShyamAI Jobs · IT Jobs in India</p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your ShyamAI Jobs account is now active"
    msg["From"] = _FROM
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL(_SMTP_HOST, _SMTP_PORT) as server:
        server.login(_SMTP_USER, _SMTP_PASS)
        server.sendmail(_SMTP_USER, to_email, msg.as_string())
