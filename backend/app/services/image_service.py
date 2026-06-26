from pathlib import Path
from PIL import Image, ImageDraw


def generate_tool_thumbnail(
    src_img: Image.Image, poly_points, tool_id: str, output_dir: Path
) -> str | None:
    """crop and save a tool thumbnail. returns the file path or None."""
    try:
        px_xs = [p.x for p in poly_points]
        px_ys = [p.y for p in poly_points]
        pad = 20
        left = max(0, int(min(px_xs)) - pad)
        top = max(0, int(min(px_ys)) - pad)
        right = min(src_img.width, int(max(px_xs)) + pad)
        bottom = min(src_img.height, int(max(px_ys)) + pad)
        crop = src_img.crop((left, top, right, bottom))
        max_dim = max(crop.width, crop.height)
        if max_dim > 256:
            scale = 256 / max_dim
            crop = crop.resize(
                (int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS
            )
        thumb_file = output_dir / f"{tool_id}.jpg"
        crop.convert("RGB").save(thumb_file, "JPEG", quality=80)
        return str(thumb_file)
    except Exception:
        return None


def generate_outline_thumbnail(
    points, tool_id: str, output_dir: Path
) -> str | None:
    """draw a tool outline (mm points) on a blank canvas. returns path or None."""
    try:
        if len(points) < 3:
            return None
        xs = [p.x for p in points]
        ys = [p.y for p in points]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        w = max_x - min_x
        h = max_y - min_y
        size = 256
        pad = 20
        avail = size - 2 * pad
        span = max(w, h)
        scale = avail / span if span > 0 else 1.0
        off_x = (size - w * scale) / 2
        off_y = (size - h * scale) / 2
        img = Image.new("RGB", (size, size), "white")
        draw = ImageDraw.Draw(img)
        pts = [
            ((p.x - min_x) * scale + off_x, (p.y - min_y) * scale + off_y)
            for p in points
        ]
        draw.polygon(pts, fill="black")
        output_dir.mkdir(parents=True, exist_ok=True)
        thumb_file = output_dir / f"{tool_id}.jpg"
        img.save(thumb_file, "JPEG", quality=80)
        return str(thumb_file)
    except Exception:
        return None
