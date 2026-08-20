from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.auth.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.db.models import AdminUser
from app.db.session import get_db
from app.envelope import envelope

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refreshToken: str


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


def _user_out(user: AdminUser) -> dict:
    return {"userId": str(user.id), "username": user.username, "role": user.role}


def _tokens_out(user: AdminUser) -> dict:
    return {"accessToken": create_access_token(user.id), "refreshToken": create_refresh_token(user.id)}


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return envelope(_tokens_out(user), message="Login successful")


@router.post("/refresh")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    user_id = decode_token(payload.refreshToken, expected_type="refresh")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user = db.get(AdminUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return envelope(_tokens_out(user))


@router.get("/me")
def me(user: AdminUser = Depends(require_admin)):
    return envelope(_user_out(user))


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    user: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.currentPassword, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    user.password_hash = hash_password(payload.newPassword)
    db.commit()
    return envelope(message="Password changed")
