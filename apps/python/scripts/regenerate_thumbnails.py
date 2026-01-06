#!/usr/bin/env python3
"""Regenerate missing thumbnails for all photos in the database."""

import asyncio
from pathlib import Path

import sys

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.database import async_session_maker, init_db
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from services.storage_service import storage_service
from sqlalchemy import select


async def regenerate_all_thumbnails():
    """Regenerate thumbnails for all photos with missing thumbnails."""
    await init_db()
    
    async with async_session_maker() as db:
        # Get all file hashes
        stmt = select(FileHash)
        result = await db.execute(stmt)
        file_hashes = result.scalars().all()
        
        regenerated = 0
        missing_original = 0
        already_exists = 0
        
        for file_hash in file_hashes:
            # Check if thumbnails exist
            thumb_path = storage_service.get_file_path(
                file_hash.sha256_hash,
                file_hash.file_extension,
                variant=storage_service.VARIANT_THUMBNAIL,
            )
            web_path = storage_service.get_file_path(
                file_hash.sha256_hash,
                file_hash.file_extension,
                variant=storage_service.VARIANT_WEB,
            )
            
            # Skip if both exist
            if thumb_path.exists() and web_path.exists():
                already_exists += 1
                continue
            
            # Check if original exists
            original_path = storage_service.get_file_path(
                file_hash.sha256_hash,
                file_hash.file_extension,
                variant=storage_service.VARIANT_ORIGINAL,
            )
            
            if not original_path.exists():
                print(f"⚠️  Original missing: {file_hash.sha256_hash[:16]}...")
                missing_original += 1
                continue
            
            # Regenerate
            success = await storage_service.regenerate_thumbnails(
                file_hash.sha256_hash,
                file_hash.file_extension,
            )
            
            if success:
                regenerated += 1
                print(f"✓ Regenerated: {file_hash.sha256_hash[:16]}...")
            else:
                missing_original += 1
        
        print("\n" + "=" * 50)
        print(f"Summary:")
        print(f"  Regenerated: {regenerated}")
        print(f"  Already exists: {already_exists}")
        print(f"  Missing original: {missing_original}")
        print(f"  Total: {len(file_hashes)}")


if __name__ == "__main__":
    asyncio.run(regenerate_all_thumbnails())

