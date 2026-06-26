from pathlib import Path

from app.models.schemas import Point
from app.services.image_service import generate_outline_thumbnail


def test_outline_thumbnail_created(tmp_path):
    points = [
        Point(x=0, y=0),
        Point(x=20, y=0),
        Point(x=20, y=10),
        Point(x=0, y=10),
    ]
    path = generate_outline_thumbnail(points, "tool-1", tmp_path)
    assert path is not None
    assert Path(path).exists()
    assert path.endswith("tool-1.jpg")


def test_outline_thumbnail_rejects_too_few_points(tmp_path):
    points = [Point(x=0, y=0), Point(x=20, y=0)]
    assert generate_outline_thumbnail(points, "tool-1", tmp_path) is None


def test_outline_thumbnail_rejects_degenerate_geometry(tmp_path):
    # three coincident points -> zero-area bounding box
    points = [Point(x=5, y=5), Point(x=5, y=5), Point(x=5, y=5)]
    assert generate_outline_thumbnail(points, "tool-1", tmp_path) is None
