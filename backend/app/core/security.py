"""
JWT authentication + role-based access control.
Roles: patient | doctor | admin
"""
from datetime import datetime, timedelta
from typing import Optional
import bcrypt as _bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

ROLES = {"patient", "doctor", "admin"}


class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[str] = None
    username: Optional[str] = None


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("user_id")
        role: str = payload.get("role")
        username: str = payload.get("username")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return TokenData(user_id=user_id, role=role, username=username)
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    return decode_token(token)


def require_role(*roles: str):
    """Dependency factory: require caller to have one of the given roles."""
    async def _check(current_user: TokenData = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {roles}",
            )
        return current_user
    return _check


# Convenience dependencies
require_admin = require_role("admin")
require_doctor = require_role("doctor", "admin")
require_patient = require_role("patient", "doctor", "admin")
