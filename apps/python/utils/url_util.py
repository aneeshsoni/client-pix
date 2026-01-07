"""URL building utilities."""

import os


def build_share_url(token: str) -> str:
    """Build the full share URL for a token."""
    base_url = os.getenv("BASE_URL", "http://localhost")
    return f"{base_url}/share/{token}"
