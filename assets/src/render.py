"""Render the README artwork from its SVG sources.

Run from anywhere: python3 assets/src/render.py
Needs Python 3, Pillow and rsvg-convert (librsvg). Only the bundled fonts in
fonts/ are visible to the renderer, so system fonts cannot change the result.
"""
from pathlib import Path
import os
import subprocess
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent
PREVIEWS = ROOT / "previews"


def render(source, output, width):
    subprocess.run(
        ["rsvg-convert", "--width", str(width), str(ROOT / source), "--output", str(output)],
        check=True,
        env=ENV,
    )


def shrink(source, output, width):
    with Image.open(source) as image:
        height = round(image.height * width / image.width)
        image.resize((width, height), Image.Resampling.LANCZOS).save(output)


with tempfile.TemporaryDirectory() as cache:
    conf = Path(cache) / "fonts.conf"
    conf.write_text(
        '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">'
        f"<fontconfig><dir>{ROOT / 'fonts'}</dir><cachedir>{cache}</cachedir></fontconfig>"
    )
    ENV = {**os.environ, "FONTCONFIG_FILE": str(conf)}

    render("icon-1024.svg", ASSETS / "icon-1024.png", 1024)
    render("how-it-works.svg", ASSETS / "how-it-works.png", 1800)

PREVIEWS.mkdir(exist_ok=True)
for size in (16, 32, 128):
    shrink(ASSETS / "icon-1024.png", PREVIEWS / f"icon-{size}.png", size)
for width in (900, 390):
    shrink(ASSETS / "how-it-works.png", PREVIEWS / f"how-it-works-{width}.png", width)
