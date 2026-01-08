"""URL building utilities."""

from core.config import BASE_URL


def build_share_url(token: str) -> str:
    """Build the full share URL for a token."""
    return f"{BASE_URL}/share/{token}"
