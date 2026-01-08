"""URL building utilities."""

from fastapi import Request


def build_share_url(token: str, request: Request) -> str:
    """
    Build the full share URL for a token.
    
    Auto-detects the domain from the request headers, so no configuration needed.
    Works automatically with any domain connected via Coolify/reverse proxy.
    """
    # Get scheme (http/https) - check X-Forwarded-Proto first (set by reverse proxy)
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    
    # Get host from X-Forwarded-Host (reverse proxy) or Host header
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "localhost"))
    
    return f"{scheme}://{host}/share/{token}"
