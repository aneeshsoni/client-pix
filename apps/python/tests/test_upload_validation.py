"""Tests for upload validation helpers."""

import pytest

from utils.upload_validation_util import UploadRejectedError, validate_upload_file_count


def test_upload_file_count_limit_disabled_allows_any_count():
    validate_upload_file_count([object(), object(), object()], None)


def test_upload_file_count_limit_rejects_when_enabled():
    with pytest.raises(UploadRejectedError, match="Too many files"):
        validate_upload_file_count([object(), object()], 1)
