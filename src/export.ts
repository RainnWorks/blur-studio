import { GlassEngine } from './gl/engine';
import type { GlassShape } from './types';

export interface ExportOptions {
  bitmap: ImageBitmap;
  shapes: GlassShape[];
  format: 'png' | 'jpeg';
  /** 0..1, jpeg only */
  quality: number;
  fileName: string;
}

/**
 * Renders the composite at the image's original resolution in an offscreen
 * WebGL context and downloads the result. Returns the actual export size
 * (clamped only if the GPU cannot allocate textures that large).
 */
export async function exportComposite(opts: ExportOptions): Promise<{ width: number; height: number }> {
  const { bitmap, shapes } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const engine = new GlassEngine(canvas);
  const gl = engine.gl;

  const maxSize = Math.min(
    gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
  );
  const clamp = Math.min(1, maxSize / bitmap.width, maxSize / bitmap.height);
  const width = Math.round(bitmap.width * clamp);
  const height = Math.round(bitmap.height * clamp);

  try {
    canvas.width = width;
    canvas.height = height;
    engine.resize(width, height);
    engine.setImage(bitmap, false);
    engine.render(shapes, bitmap.width, bitmap.height);

    // read back synchronously, before the drawing buffer can be cleared
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // flip vertically (GL origin is bottom-left) and force opaque alpha
    const flipped = new Uint8ClampedArray(width * height * 4);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * rowBytes;
      flipped.set(pixels.subarray(src, src + rowBytes), y * rowBytes);
    }
    for (let i = 3; i < flipped.length; i += 4) {
      flipped[i] = 255;
    }

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Failed to create 2D context for export');
    ctx.putImageData(new ImageData(flipped, width, height), 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        opts.format === 'png' ? 'image/png' : 'image/jpeg',
        opts.quality,
      );
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = opts.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    return { width, height };
  } finally {
    engine.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
