"""
Authentication Router — register, login, Google OAuth, profile.
"""
import secrets
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
import httpx

from app.db.database import get_db
from app.db import crud
from app.core.config import settings
from app.core.security import (
    verify_password, create_access_token, get_current_user, TokenData
)
from app.db.crud import log_audit

# ─── Google OAuth constants ───────────────────────────────────────────────────
_GOOGLE_AUTH_URL    = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL   = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO    = "https://www.googleapis.com/oauth2/v2/userinfo"
_BACKEND_CALLBACK   = "http://localhost:8000/api/auth/google/callback"
_FRONTEND_URL       = "http://localhost:3000"

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ─── Schemas ─────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    role: str = "patient"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in {"patient", "doctor", "admin"}:
            raise ValueError("role must be patient, doctor, or admin")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    age: Optional[int]
    gender: Optional[str]
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ─── Endpoints ───────────────────────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, request: Request,
                   db: AsyncSession = Depends(get_db)):
    # Check duplicate username / email
    if await crud.get_user_by_username(db, body.username):
        raise HTTPException(400, "Username already taken")
    if await crud.get_user_by_email(db, body.email):
        raise HTTPException(400, "Email already registered")

    user = await crud.create_user(
        db, username=body.username, email=body.email,
        password=body.password, full_name=body.full_name,
        age=body.age, gender=body.gender, role=body.role,
    )
    await log_audit(db, user.id, "register", "users", user.id,
                    ip_address=request.client.host)

    token = create_access_token(
        {"user_id": user.id, "role": user.role.value, "username": user.username}
    )
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id, username=user.username, email=user.email,
            full_name=user.full_name, age=user.age,
            gender=user.gender, role=user.role.value,
        ),
    )


@router.post("/token", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(),
                db: AsyncSession = Depends(get_db),
                request: Request = None):
    user = await crud.get_user_by_username(db, form.username)
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if not user.is_active:
        raise HTTPException(400, "Account is disabled")

    token = create_access_token(
        {"user_id": user.id, "role": user.role.value, "username": user.username}
    )
    await log_audit(db, user.id, "login", "auth", None,
                    ip_address=getattr(request.client, "host", "unknown") if request else None)

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id, username=user.username, email=user.email,
            full_name=user.full_name, age=user.age,
            gender=user.gender, role=user.role.value,
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: TokenData = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    user = await crud.get_user_by_id(db, current_user.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return UserResponse(
        id=user.id, username=user.username, email=user.email,
        full_name=user.full_name, age=user.age,
        gender=user.gender, role=user.role.value,
    )


@router.put("/me/profile")
async def update_profile(
    body: dict,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed = {"full_name", "age", "gender", "phone"}
    update_data = {k: v for k, v in body.items() if k in allowed}
    user = await crud.update_user_profile(db, current_user.user_id, **update_data)
    return {"message": "Profile updated", "user_id": user.id}


# ─── Google OAuth ─────────────────────────────────────────────────────────────

@router.get("/google", tags=["Google OAuth"])
async def google_login():
    """Redirect the browser to Google's consent screen."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google OAuth is not configured on this server")
    params = urlencode({
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "redirect_uri":  _BACKEND_CALLBACK,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "prompt":        "select_account",
    })
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback", tags=["Google OAuth"])
async def google_callback(
    code:  Optional[str] = None,
    error: Optional[str] = None,
    db:    AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Receive Google's redirect, exchange for JWT, send user to frontend."""
    if error or not code:
        return RedirectResponse(f"{_FRONTEND_URL}/login?error=google_denied")

    async with httpx.AsyncClient() as client:
        # 1. Exchange authorisation code for Google access token
        token_resp = await client.post(_GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri":  _BACKEND_CALLBACK,
            "grant_type":    "authorization_code",
        })
        g_token = token_resp.json().get("access_token")
        if not g_token:
            return RedirectResponse(f"{_FRONTEND_URL}/login?error=google_failed")

        # 2. Fetch user profile from Google
        info_resp = await client.get(
            _GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {g_token}"},
        )
        userinfo  = info_resp.json()

    email     = userinfo.get("email")
    full_name = userinfo.get("name", "")

    if not email:
        return RedirectResponse(f"{_FRONTEND_URL}/login?error=no_email")

    # 3. Find existing user or create a new patient account
    user = await crud.get_user_by_email(db, email)
    ip   = getattr(request.client, "host", "unknown") if request else None

    if not user:
        # Derive a unique username from the email local-part
        base = email.split("@")[0].replace(".", "_").replace("-", "_")
        username, counter = base, 1
        while await crud.get_user_by_username(db, username):
            username = f"{base}{counter}"
            counter += 1

        user = await crud.create_user(
            db,
            username=username,
            email=email,
            password=secrets.token_urlsafe(32),  # random — Google users never use it
            full_name=full_name,
            role="patient",
        )
        await log_audit(db, user.id, "google_register", "users", user.id, ip_address=ip)
    else:
        await log_audit(db, user.id, "google_login", "auth", None, ip_address=ip)

    # 4. Issue our own JWT and send the user back to the frontend
    jwt_token = create_access_token(
        {"user_id": user.id, "role": user.role.value, "username": user.username}
    )
    return RedirectResponse(f"{_FRONTEND_URL}/auth/google/success?token={jwt_token}")
