"""Slug generation utilities."""

import re


def generate_slug(title: str) -> str:
    """
    Generate a URL-friendly slug from title.

    Since albums have unique IDs in the database, we don't need a random suffix.
    If duplicate slugs occur, the database constraint will handle it.

    Example:
        "Wedding Photos 2024!" -> "wedding-photos-2024"
    """
    # Convert to lowercase and replace spaces/special chars with hyphens
    slug = re.sub(r"[^a-zA-Z0-9\s-]", "", title.lower())
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug
