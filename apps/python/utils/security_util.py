"""Security utilities for authentication and token generation."""

import base64
import io
import json
import secrets

import bcrypt
import pyotp
import qrcode


def generate_token(length: int = 32) -> str:
    """Generate a secure random token for share links."""
    return secrets.token_urlsafe(length)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a hash."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


# ============================================================================
# 2FA / TOTP Utilities
# ============================================================================


def generate_totp_secret() -> str:
    """Generate a new TOTP secret for 2FA setup."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str, issuer: str = "ClientPix") -> str:
    """Generate the otpauth:// URI for authenticator app setup."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=issuer)


def verify_totp_code(secret: str, code: str) -> bool:
    """
    Verify a TOTP code against the secret.
    Allows for 1 time window before and after for clock drift tolerance.
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_backup_codes(count: int = 10) -> list[str]:
    """Generate a list of backup codes for 2FA recovery."""
    return [secrets.token_hex(4).upper() for _ in range(count)]


def encode_backup_codes(codes: list[str]) -> str:
    """Encode backup codes as JSON for database storage."""
    return json.dumps(codes)


def decode_backup_codes(encoded: str | None) -> list[str]:
    """Decode backup codes from database storage."""
    if not encoded:
        return []
    return json.loads(encoded)


def verify_backup_code(encoded_codes: str | None, code: str) -> tuple[bool, str | None]:
    """
    Verify a backup code and return updated codes if valid.
    Returns (is_valid, new_encoded_codes).
    Backup codes are single-use, so the used code is removed.
    """
    codes = decode_backup_codes(encoded_codes)
    # Normalize the input code (uppercase, no spaces/dashes)
    normalized_code = code.upper().replace("-", "").replace(" ", "")

    for stored_code in codes:
        if stored_code == normalized_code:
            # Remove the used code
            codes.remove(stored_code)
            return True, encode_backup_codes(codes) if codes else None

    return False, None


def generate_qr_code_data_url(uri: str) -> str:
    """Generate a QR code as a data URL for frontend display."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # Convert to base64 data URL
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return f"data:image/png;base64,{img_base64}"
