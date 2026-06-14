"""
Generate professional shield-style icons for the BABE Chrome Extension.
Creates 16x16, 48x48, and 128x128 PNG icons.
"""

import os
from PIL import Image, ImageDraw, ImageFont
import math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "babe_extension", "icons")


def draw_shield_icon(size):
    """Draw a modern shield icon with 'B' letter at the given size."""
    # Use a larger canvas for quality, then downscale
    scale = 8
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Shield outline path (using polygon approximation)
    cx, cy = s // 2, s // 2
    margin = int(s * 0.08)

    # Shield shape points
    shield_points = []
    top_y = margin
    bottom_y = s - margin
    mid_y = int(s * 0.55)
    left_x = margin
    right_x = s - margin

    # Top-left corner
    shield_points.append((left_x, top_y + int(s * 0.05)))
    # Top edge
    shield_points.append((cx, top_y))
    # Top-right corner
    shield_points.append((right_x, top_y + int(s * 0.05)))
    # Right edge going down
    shield_points.append((right_x, mid_y))
    # Bottom point (shield tip)
    # Create a smooth curve to the bottom
    steps = 20
    for i in range(steps + 1):
        t = i / steps
        # Bezier-like curve from right-mid to bottom center
        x = right_x * (1 - t) ** 2 + cx * 2 * (1 - t) * t + cx * t ** 2
        y = mid_y * (1 - t) ** 2 + bottom_y * 2 * (1 - t) * t + bottom_y * t ** 2
        shield_points.append((int(x), int(y)))

    for i in range(steps + 1):
        t = i / steps
        x = cx * (1 - t) ** 2 + cx * 2 * (1 - t) * t + left_x * t ** 2
        y = bottom_y * (1 - t) ** 2 + bottom_y * 2 * (1 - t) * t + mid_y * t ** 2
        shield_points.append((int(x), int(y)))

    shield_points.append((left_x, mid_y))

    # Gradient-like effect: draw filled shield with main color
    # Deep purple-blue gradient
    main_color = (99, 54, 255)  # Vibrant purple
    accent_color = (168, 130, 255)  # Lighter purple

    # Draw outer glow
    for offset in range(int(s * 0.02), 0, -1):
        glow_points = [(x, y + offset) for x, y in shield_points]
        alpha = int(30 * (1 - offset / (s * 0.02)))
        draw.polygon(glow_points, fill=(*main_color, alpha))

    # Draw main shield
    draw.polygon(shield_points, fill=main_color)

    # Draw inner highlight
    inner_margin = int(s * 0.06)
    inner_points = []
    for px, py in shield_points:
        # Move points towards center
        dx = cx - px
        dy = cy - py
        dist = math.sqrt(dx * dx + dy * dy) if (dx * dx + dy * dy) > 0 else 1
        ratio = inner_margin / dist
        inner_points.append((int(px + dx * ratio), int(py + dy * ratio)))

    draw.polygon(inner_points, fill=(120, 80, 255, 80))

    # Draw "B" letter
    font_size = int(s * 0.45)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype(
                "/System/Library/Fonts/SFNSDisplay.ttf", font_size
            )
        except (OSError, IOError):
            font = ImageFont.load_default()

    letter = "B"
    bbox = draw.textbbox((0, 0), letter, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = cx - tw // 2
    ty = cy - th // 2 - int(s * 0.02)

    # Letter shadow
    draw.text((tx + 2, ty + 2), letter, fill=(40, 20, 80, 100), font=font)
    # Letter
    draw.text((tx, ty), letter, fill=(255, 255, 255), font=font)

    # Downscale with antialiasing
    img = img.resize((size, size), Image.LANCZOS)
    return img


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for size in [16, 48, 128]:
        icon = draw_shield_icon(size)
        path = os.path.join(OUTPUT_DIR, f"icon-{size}.png")
        icon.save(path, "PNG")
        print(f"✅ Generated {path}")

    print("Done! All icons generated.")


if __name__ == "__main__":
    main()
