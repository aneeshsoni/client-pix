"""Shared authentication helpers for admin-protected API endpoints."""

from fastapi import Depends, Header, HTTPException, Query
from models.db.admin_db_models import Admin
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from utils.jwt_util import get_admin_id_from_token


async def get_admin_from_token_or_query(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
    token: str | None = Query(
        None, description="JWT auth token (alternative to Authorization header)"
    ),
) -> Admin:
    """
    Resolve the authenticated admin from either a bearer token header
    or a query parameter token for browser-initiated file downloads.
    """
    jwt_token = None

    if authorization and authorization.startswith("Bearer "):
        jwt_token = authorization.replace("Bearer ", "")
    elif token:
        jwt_token = token

    if not jwt_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin_id = get_admin_id_from_token(jwt_token)
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    stmt = select(Admin).where(Admin.id == admin_id)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")

    return admin
