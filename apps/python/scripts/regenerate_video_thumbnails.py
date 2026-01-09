"""
Regenerate thumbnails for videos that are missing them.

Usage:
    docker compose exec python uv run python scripts/regenerate_video_thumbnails.py
"""

import subprocess
import json
from pathlib import Path

# Configuration
UPLOAD_DIR = Path("/app/uploads")
VIDEOS_DIR = UPLOAD_DIR / "videos"
THUMBNAILS_DIR = UPLOAD_DIR / "thumbnails"

THUMBNAIL_SIZE = 400
THUMBNAIL_QUALITY = 85
WEB_MAX_DIMENSION = 2048
WEB_QUALITY = 85


def get_thumbnail_path(file_id: str) -> Path:
    """Get thumbnail path for a video file_id."""
    prefix = file_id[:2]
    second = file_id[2:4]
    return THUMBNAILS_DIR / prefix / second / f"{file_id}.webp"


def get_web_path(file_id: str) -> Path:
    """Get web poster path for a video file_id."""
    prefix = file_id[:2]
    second = file_id[2:4]
    return UPLOAD_DIR / "web" / prefix / second / f"{file_id}.webp"


def generate_video_thumbnails(video_path: Path, file_id: str) -> tuple[int, int]:
    """Generate thumbnail and web poster from video."""

    # Get video dimensions using ffprobe
    width, height = 1920, 1080
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_streams",
                "-select_streams",
                "v:0",
                str(video_path),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if data.get("streams"):
                stream = data["streams"][0]
                width = stream.get("width", 1920)
                height = stream.get("height", 1080)
    except Exception as e:
        print(f"  Warning: Could not probe dimensions: {e}")

    # Generate thumbnail
    thumb_path = get_thumbnail_path(file_id)
    thumb_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                "1",
                "-i",
                str(video_path),
                "-vframes",
                "1",
                "-vf",
                f"scale={THUMBNAIL_SIZE}:-1",
                "-q:v",
                str(100 - THUMBNAIL_QUALITY),
                str(thumb_path),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print(f"  ✓ Generated thumbnail: {thumb_path}")
        else:
            print(f"  ✗ Thumbnail failed: {result.stderr}")
    except Exception as e:
        print(f"  ✗ Thumbnail error: {e}")

    # Generate web poster
    web_path = get_web_path(file_id)
    web_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                "1",
                "-i",
                str(video_path),
                "-vframes",
                "1",
                "-vf",
                f"scale='min({WEB_MAX_DIMENSION},iw)':-1",
                "-q:v",
                str(100 - WEB_QUALITY),
                str(web_path),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print(f"  ✓ Generated web poster: {web_path}")
        else:
            print(f"  ✗ Web poster failed: {result.stderr}")
    except Exception as e:
        print(f"  ✗ Web poster error: {e}")

    return width, height


def main():
    """Find and regenerate thumbnails for videos missing them."""

    if not VIDEOS_DIR.exists():
        print("No videos directory found")
        return

    video_files = list(VIDEOS_DIR.glob("*.*"))
    print(f"Found {len(video_files)} video files")

    missing_thumbs = 0
    generated = 0

    for video_path in video_files:
        file_id = video_path.stem  # UUID without extension
        thumb_path = get_thumbnail_path(file_id)
        web_path = get_web_path(file_id)

        if not thumb_path.exists() or not web_path.exists():
            missing_thumbs += 1
            print(f"\nProcessing: {video_path.name}")
            generate_video_thumbnails(video_path, file_id)
            generated += 1

    print(f"\n{'=' * 50}")
    print(f"Total videos: {len(video_files)}")
    print(f"Missing thumbnails: {missing_thumbs}")
    print(f"Generated: {generated}")


if __name__ == "__main__":
    main()
