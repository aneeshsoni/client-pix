"""Share link API endpoints for album owners (authenticated)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.api.share_links_api_models import (
    ShareLinkCreate,
    ShareLinkListResponse,
    ShareLinkResponse,
    ShareLinkUpdate,
)
from models.db.album_db_models import Album
from models.db.share_link_db_models import ShareLink
from utils.security_util import generate_token, hash_password
from utils.url_util import build_share_url

router = APIRouter(prefix="/albums", tags=["share-links"])


@router.post("/{album_id}/share", response_model=ShareLinkResponse, status_code=201)
async def create_share_link(
    album_id: uuid.UUID,
    data: ShareLinkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new share link for an album."""
    # Verify album exists
    stmt = select(Album).where(Album.id == album_id)
    result = await db.execute(stmt)
    album = result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Generate token
    token = generate_token()

    # Hash password if provided
    password_hash = None
    is_password_protected = False
    if data.password:
        password_hash = hash_password(data.password)
        is_password_protected = True

    # Create share link
    share_link = ShareLink(
        album_id=album_id,
        token=token,
        password_hash=password_hash,
        is_password_protected=is_password_protected,
        expires_at=data.expires_at,
    )
    db.add(share_link)
    await db.commit()
    await db.refresh(share_link)

    return ShareLinkResponse(
        id=share_link.id,
        album_id=share_link.album_id,
        token=share_link.token,
        share_url=build_share_url(share_link.token, request),
        is_password_protected=share_link.is_password_protected,
        expires_at=share_link.expires_at,
        is_revoked=share_link.is_revoked,
        created_at=share_link.created_at,
        updated_at=share_link.updated_at,
    )


@router.get("/{album_id}/share", response_model=ShareLinkListResponse)
async def list_share_links(
    album_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List all share links for an album."""
    # Verify album exists
    stmt = select(Album).where(Album.id == album_id)
    result = await db.execute(stmt)
    album = result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get all share links for this album
    stmt = (
        select(ShareLink)
        .where(ShareLink.album_id == album_id)
        .order_by(ShareLink.created_at.desc())
    )
    result = await db.execute(stmt)
    share_links = result.scalars().all()

    return ShareLinkListResponse(
        share_links=[
            ShareLinkResponse(
                id=link.id,
                album_id=link.album_id,
                token=link.token,
                share_url=build_share_url(link.token, request),
                is_password_protected=link.is_password_protected,
                expires_at=link.expires_at,
                is_revoked=link.is_revoked,
                created_at=link.created_at,
                updated_at=link.updated_at,
            )
            for link in share_links
        ],
        total_count=len(share_links),
    )


@router.patch("/{album_id}/share/{share_link_id}", response_model=ShareLinkResponse)
async def update_share_link(
    album_id: uuid.UUID,
    share_link_id: uuid.UUID,
    data: ShareLinkUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update a share link (password, expiration, revoke)."""
    # Verify album exists
    album_stmt = select(Album).where(Album.id == album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get share link
    stmt = select(ShareLink).where(
        ShareLink.id == share_link_id, ShareLink.album_id == album_id
    )
    result = await db.execute(stmt)
    share_link = result.scalar_one_or_none()

    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")

    # Update fields
    if data.password is not None:
        if data.password:
            share_link.password_hash = hash_password(data.password)
            share_link.is_password_protected = True
        else:
            # Empty password means remove protection
            share_link.password_hash = None
            share_link.is_password_protected = False

    if data.expires_at is not None:
        share_link.expires_at = data.expires_at

    if data.is_revoked is not None:
        share_link.is_revoked = data.is_revoked

    await db.commit()
    await db.refresh(share_link)

    return ShareLinkResponse(
        id=share_link.id,
        album_id=share_link.album_id,
        token=share_link.token,
        share_url=build_share_url(share_link.token, request),
        is_password_protected=share_link.is_password_protected,
        expires_at=share_link.expires_at,
        is_revoked=share_link.is_revoked,
        created_at=share_link.created_at,
        updated_at=share_link.updated_at,
    )


@router.delete("/{album_id}/share/{share_link_id}", status_code=204)
async def delete_share_link(
    album_id: uuid.UUID,
    share_link_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a share link."""
    # Verify album exists
    album_stmt = select(Album).where(Album.id == album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get share link
    stmt = select(ShareLink).where(
        ShareLink.id == share_link_id, ShareLink.album_id == album_id
    )
    result = await db.execute(stmt)
    share_link = result.scalar_one_or_none()

    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")

    await db.delete(share_link)
    await db.commit()
