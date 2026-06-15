"""Download OpenCV face recognition model assets."""

from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

DEFAULT_MODEL_DIR = Path("models_ml/faces")
MODELS = {
    "face_detection_yunet_2023mar.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/"
        "face_detection_yunet/face_detection_yunet_2023mar.onnx"
    ),
    "face_recognition_sface_2021dec.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/"
        "face_recognition_sface/face_recognition_sface_2021dec.onnx"
    ),
}


def download_file(url: str, destination: Path, force: bool) -> None:
    """Download one model file if needed."""
    if destination.exists() and not force:
        print(f"Exists: {destination}")
        return

    print(f"Downloading: {destination.name}")
    with urllib.request.urlopen(url, timeout=120) as response:
        destination.write_bytes(response.read())
    print(f"Saved: {destination}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=DEFAULT_MODEL_DIR,
        help="Directory where model files should be saved",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing model files",
    )
    args = parser.parse_args()

    args.model_dir.mkdir(parents=True, exist_ok=True)
    for filename, url in MODELS.items():
        download_file(url, args.model_dir / filename, args.force)

    print("Face model assets are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
