"""
Password reset script for Client Pix.

This script allows server administrators to reset a user's password
when they've forgotten it. Since Client Pix is self-hosted and doesn't
use email, this is the recommended way to handle password resets.

Usage:
    # Via Docker (recommended):
    docker compose exec backend uv run python scripts/reset_password.py

    # If running locally (from apps/python directory):
    uv run python scripts/reset_password.py
"""

import asyncio
import getpass
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.database import async_session_maker
from models.db.admin_db_models import Admin
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.security_util import hash_password


async def main() -> None:
    """Main password reset flow."""
    print("=" * 50)
    print("Client Pix Password Reset")
    print("=" * 50)
    print()

    async with async_session_maker() as session:
        session: AsyncSession

        # List all admin users
        result = await session.execute(select(Admin).order_by(Admin.created_at))
        admins = result.scalars().all()

        if not admins:
            print("No admin accounts found in the database.")
            print("Start the application and register a new account.")
            sys.exit(1)

        print("Available admin accounts:")
        print("-" * 50)
        for i, admin in enumerate(admins, 1):
            owner_tag = " (owner)" if admin.is_owner else ""
            twofa_tag = " [2FA enabled]" if admin.totp_enabled else ""
            print(f"  {i}. {admin.email}{owner_tag}{twofa_tag}")
        print()

        # Get user selection
        while True:
            try:
                choice = input(f"Select account to reset (1-{len(admins)}): ").strip()
                idx = int(choice) - 1
                if 0 <= idx < len(admins):
                    selected_admin = admins[idx]
                    break
                print(f"Please enter a number between 1 and {len(admins)}")
            except ValueError:
                print("Please enter a valid number")
            except KeyboardInterrupt:
                print("\nCancelled.")
                sys.exit(0)

        print()
        print(f"Resetting password for: {selected_admin.email}")
        print()

        # Get new password
        while True:
            try:
                password = getpass.getpass("Enter new password (min 8 characters): ")
                if len(password) < 8:
                    print("Password must be at least 8 characters")
                    continue

                confirm = getpass.getpass("Confirm new password: ")
                if password != confirm:
                    print("Passwords do not match")
                    continue

                break
            except KeyboardInterrupt:
                print("\nCancelled.")
                sys.exit(0)

        # Ask about 2FA reset
        reset_2fa = False
        if selected_admin.totp_enabled:
            print()
            print("This account has 2FA enabled.")
            try:
                response = (
                    input("Do you also want to disable 2FA? (y/N): ").strip().lower()
                )
                reset_2fa = response == "y"
            except KeyboardInterrupt:
                print("\nCancelled.")
                sys.exit(0)

        # Update the password
        selected_admin.password_hash = hash_password(password)

        if reset_2fa:
            selected_admin.totp_enabled = False
            selected_admin.totp_secret = None
            selected_admin.backup_codes = None

        await session.commit()

        print()
        print("=" * 50)
        print("Password reset successful!")
        if reset_2fa:
            print("2FA has been disabled.")
        print("=" * 50)
        print()
        print(f"You can now log in with: {selected_admin.email}")


if __name__ == "__main__":
    asyncio.run(main())
