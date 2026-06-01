import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..schemas import UserRegister, UserLogin, Token, UserOut, RegisterResponse
from ..auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _gen_token() -> str:
    return secrets.token_urlsafe(32)


def _token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=24)


@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    token = _gen_token()
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="user",
        is_verified=False,
        verification_token=token,
        verification_token_expires=_token_expiry(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Send verification email — non-fatal if SMTP fails
    try:
        from services.email_service import send_verification_email
        send_verification_email(user.email, user.full_name or "", token)
        email_sent = True
    except Exception as exc:
        print(f"[email] Failed to send verification email to {user.email}: {exc}")
        email_sent = False

    msg = (
        "Account created! Check your inbox for a verification link."
        if email_sent
        else "Account created, but we couldn't send the verification email. Please use 'Resend verification' on the login page."
    )
    return RegisterResponse(message=msg, email=user.email)


@router.post("/verify-email", response_model=Token)
def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == token).first()
    if not user:
        raise HTTPException(400, "Invalid or expired verification link.")
    if user.verification_token_expires and user.verification_token_expires < datetime.now(timezone.utc):
        raise HTTPException(400, "Verification link has expired. Please request a new one.")
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()
    db.refresh(user)
    jwt = create_access_token({"sub": str(user.id)})
    return Token(access_token=jwt, user=UserOut.model_validate(user))


class ResendRequest(BaseModel):
    email: str


@router.post("/resend-verification")
def resend_verification(payload: ResendRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    # Always return 200 to avoid email enumeration
    if not user or user.is_verified:
        return {"message": "If that email is registered and unverified, a new link has been sent."}

    token = _gen_token()
    user.verification_token = token
    user.verification_token_expires = _token_expiry()
    db.commit()

    try:
        from services.email_service import send_verification_email
        send_verification_email(user.email, user.full_name or "", token)
    except Exception as exc:
        print(f"[email] Resend failed for {user.email}: {exc}")
        raise HTTPException(500, "Failed to send email. Please try again later.")

    return {"message": "Verification email resent. Check your inbox."}


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
    jwt = create_access_token({"sub": str(user.id)})
    return Token(access_token=jwt, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
