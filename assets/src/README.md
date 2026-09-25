# Blur Studio README artwork

| Image | Pixels | Source |
|---|---|---|
| `icon-1024.png` | 1024 × 1024 | `icon-1024.svg` |
| `how-it-works.png` | 1800 × 700 | `how-it-works.svg` |
| `hero.png` | 2000 × 1250 | screenshot of the app, from `scripts/screenshots.mjs` |
| `demo.gif` | 900 × 563 | screen recording of the app, from `scripts/screenshots.mjs` |
| `export.jpg` | 2000 × 1333 | an export from the app, converted to JPEG |

The icon and the diagram are hand-written SVG. No image-generation model was used.
They use the Blur Studio accent from the RainnWorks site, `#6E8BFF`, on `#0B0C14`.
The icon keeps the shared RainnWorks tile: an 824px rounded square with 100px
margins, transparent outside. It shows a glass panel over a blue disc; under the
panel the disc is blurred and shifted, as the app blurs and refracts a photo.

## Rebuild the icon and the diagram

From the repository root, with Python 3, Pillow and `rsvg-convert` (librsvg):

```sh
python3 assets/src/render.py
```

This writes `../icon-1024.png` and `../how-it-works.png`, and review copies in
`previews/`: the icon at 16, 32 and 128 px, and the diagram at 900 and 390 px wide.
The renderer sees only the fonts in `fonts/`, so system fonts cannot change the result.

## Rebuild the screenshots

With `bun run dev` running, ffmpeg on the `PATH` and two photos at
`/tmp/demo-1015.jpg` and `/tmp/demo-1043.jpg` (or set `PHOTO` and `PHOTO2`):

```sh
bun scripts/screenshots.mjs
```

The script writes `export.png`. The README uses a JPEG copy, `export.jpg`, to keep it small.
The photos came from [Lorem Picsum](https://picsum.photos).

## Fonts

Bundled under their SIL Open Font Licenses, which sit next to the font files:

- Instrument Sans, Regular and SemiBold: https://github.com/google/fonts/tree/main/ofl/instrumentsans
- IBM Plex Mono, Regular: https://github.com/google/fonts/tree/main/ofl/ibmplexmono
