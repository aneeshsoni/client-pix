"""Tests for security utilities."""

from utils.security_util import (
    encode_backup_codes,
    generate_backup_codes,
    generate_token,
    hash_password,
    verify_backup_code,
    verify_password,
)


class TestPasswordHashing:
    """Tests for password hashing functions."""

    def test_hash_password_returns_different_value(self):
        """Test that hashed password differs from original."""
        password = "securepassword123"
        hashed = hash_password(password)
        assert hashed != password
        assert len(hashed) > 0

    def test_verify_password_correct(self):
        """Test that correct password verifies."""
        password = "securepassword123"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Test that incorrect password fails verification."""
        password = "securepassword123"
        hashed = hash_password(password)
        assert verify_password("wrongpassword", hashed) is False

    def test_hash_password_unique_salts(self):
        """Test that same password produces different hashes (unique salts)."""
        password = "securepassword123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        assert hash1 != hash2
        # But both should verify correctly
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True


class TestBackupCodes:
    """Tests for 2FA backup code functions."""

    def test_generate_backup_codes_count(self):
        """Test that correct number of backup codes are generated."""
        codes = generate_backup_codes(count=5)
        assert len(codes) == 5

    def test_generate_backup_codes_default_count(self):
        """Test default backup code count."""
        codes = generate_backup_codes()
        assert len(codes) == 10

    def test_generate_backup_codes_format(self):
        """Test backup codes are 8 uppercase hex characters."""
        codes = generate_backup_codes(count=3)
        for code in codes:
            assert len(code) == 8
            assert code.isupper()
            # Should be valid hex
            int(code, 16)

    def test_encode_backup_codes_hashed(self):
        """Test that backup codes are hashed when encoded."""
        codes = generate_backup_codes(count=2)
        encoded = encode_backup_codes(codes)
        # Encoded should not contain the original codes
        for code in codes:
            assert code not in encoded

    def test_verify_backup_code_valid(self):
        """Test verifying a valid backup code."""
        codes = generate_backup_codes(count=3)
        encoded = encode_backup_codes(codes)

        # First code should verify
        is_valid, remaining = verify_backup_code(encoded, codes[0])
        assert is_valid is True
        assert remaining is not None

    def test_verify_backup_code_invalid(self):
        """Test verifying an invalid backup code."""
        codes = generate_backup_codes(count=3)
        encoded = encode_backup_codes(codes)

        is_valid, remaining = verify_backup_code(encoded, "INVALID1")
        assert is_valid is False
        assert remaining is None

    def test_verify_backup_code_single_use(self):
        """Test that backup codes are single-use."""
        codes = generate_backup_codes(count=2)
        encoded = encode_backup_codes(codes)

        # Use first code
        is_valid, remaining = verify_backup_code(encoded, codes[0])
        assert is_valid is True

        # Try to use same code again on remaining codes
        is_valid, _ = verify_backup_code(remaining, codes[0])
        assert is_valid is False

    def test_verify_backup_code_case_insensitive(self):
        """Test that backup code verification is case-insensitive."""
        codes = generate_backup_codes(count=1)
        encoded = encode_backup_codes(codes)

        # Try lowercase version
        is_valid, _ = verify_backup_code(encoded, codes[0].lower())
        assert is_valid is True

    def test_verify_backup_code_empty(self):
        """Test verifying against empty/None encoded codes."""
        is_valid, remaining = verify_backup_code(None, "ANYCODE1")
        assert is_valid is False
        assert remaining is None

        is_valid, remaining = verify_backup_code("", "ANYCODE1")
        assert is_valid is False


class TestTokenGeneration:
    """Tests for token generation."""

    def test_generate_token_length(self):
        """Test token generation with custom length."""
        token = generate_token(length=32)
        # URL-safe base64 encoding produces ~4/3 the length
        assert len(token) > 0

    def test_generate_token_unique(self):
        """Test that generated tokens are unique."""
        tokens = [generate_token() for _ in range(100)]
        assert len(set(tokens)) == 100
