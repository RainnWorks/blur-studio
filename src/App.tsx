import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GlassEngine } from './gl/engine';
import { GlassBoxes } from './components/GlassBoxes';
import { useStudioControls, type PanelKey, type PanelValue } from './controls';
import { exportComposite } from './export';
import { PRESETS, applyPresetToShape, type PresetSpec } from './presets';
import {
  DEFAULT_MATERIAL,
  LENGTH_KNOBS,
  SIZE_SCALED_KNOBS,
  type GlassShape,
  type MaterialSettings,
} from './types';

interface LoadedImage {
  bitmap: ImageBitmap;
  name: string;
}

type PanelState = MaterialSettings & {
  cornerRadius: number;
  roundness: number;
  scaleWithSize: boolean;
};

const MATERIAL_KEYS = Object.keys(DEFAULT_MATERIAL) as (keyof MaterialSettings)[];

function AlignIcon({ kind }: { kind: 'left' | 'centerH' | 'right' | 'top' | 'middle' | 'bottom' }) {
  // edge line + box, 14x14
  const parts: Record<typeof kind, { line: [number, number, number, number]; box: [number, number, number, number] }> = {
    left: { line: [1.5, 1, 1.5, 13], box: [4, 4, 7, 6] },
    centerH: { line: [7, 1, 7, 13], box: [3.5, 4, 7, 6] },
    right: { line: [12.5, 1, 12.5, 13], box: [3, 4, 7, 6] },
    top: { line: [1, 1.5, 13, 1.5], box: [4, 4, 6, 7] },
    middle: { line: [1, 7, 13, 7], box: [4, 3.5, 6, 7] },
    bottom: { line: [1, 12.5, 13, 12.5], box: [4, 3, 6, 7] },
  };
  const { line, box } = parts[kind];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke="currentColor" strokeWidth="1.6" />
      <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} rx="1.5" fill="currentColor" opacity="0.65" />
    </svg>
  );
}

function materialFromPanel(panel: PanelState): MaterialSettings {
  const m = {} as Record<string, unknown>;
  for (const key of MATERIAL_KEYS) {
    const v = panel[key];
    m[key] = typeof v === 'object' && v !== null ? { ...v } : v;
  }
  return m as unknown as MaterialSettings;
}

function scaleMaterial(m: MaterialSettings, ratio: number): MaterialSettings {
  const next = { ...m, tint: { ...m.tint } };
  for (const key of LENGTH_KNOBS) {
    next[key] = m[key] * ratio;
  }
  return next;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<LoadedImage | null>(null);
  const [shapes, setShapes] = useState<GlassShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const [exporting, setExporting] = useState(false);

  const engineRef = useRef<GlassEngine | null>(null);
  const dirtyRef = useRef(false);
  const shapesRef = useRef<GlassShape[]>([]);
  const imageRef = useRef<LoadedImage | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const lastImageHeightRef = useRef(1000);
  const panelRef = useRef<PanelState>({
    ...DEFAULT_MATERIAL,
    cornerRadius: 80,
    roundness: 5,
    scaleWithSize: true,
  });

  shapesRef.current = shapes;
  selectedIdRef.current = selectedId;

  // Any knob change: remember it as the "current config" and apply it to the
  // selected bubble. Equality checks make panel<->shape echo a no-op.
  const handlePanelValue = useCallback((key: PanelKey, value: PanelValue) => {
    (panelRef.current as unknown as Record<string, PanelValue>)[key] = value;
    const id = selectedIdRef.current;
    if (!id) return;
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (key === 'cornerRadius') {
          return s.radiusPct === value ? s : { ...s, radiusPct: value as number };
        }
        if (key === 'roundness') {
          return s.roundness === value ? s : { ...s, roundness: value as number };
        }
        if (key === 'scaleWithSize') {
          return (s.scaleWithSize !== false) === value
            ? s
            : { ...s, scaleWithSize: value as boolean };
        }
        if (key === 'tint') {
          const t = value as MaterialSettings['tint'];
          const c = s.material.tint;
          if (c.r === t.r && c.g === t.g && c.b === t.b && c.a === t.a) return s;
          return { ...s, material: { ...s.material, tint: { ...t } } };
        }
        const current = s.material[key as keyof MaterialSettings];
        if (current === value) return s;
        return { ...s, material: { ...s.material, [key]: value } };
      }),
    );
  }, []);

  const { set, exportSettings } = useStudioControls(handlePanelValue);

  const syncPanelFromShape = useCallback(
    (s: GlassShape) => {
      set({
        ...s.material,
        cornerRadius: s.radiusPct,
        roundness: s.roundness,
        scaleWithSize: s.scaleWithSize !== false,
      });
    },
    [set],
  );

  // selection -> panel
  useEffect(() => {
    const s = shapesRef.current.find((x) => x.id === selectedId);
    if (s) syncPanelFromShape(s);
  }, [selectedId, syncPanelFromShape]);

  // mark dirty on anything that affects the render
  useEffect(() => {
    dirtyRef.current = true;
  }, [shapes, image, fit]);

  // engine + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GlassEngine(canvas);
    engineRef.current = engine;
    if (imageRef.current) {
      engine.setImage(imageRef.current.bitmap, true);
    }
    if (canvas.width > 1 && canvas.height > 1) {
      engine.resize(canvas.width, canvas.height);
    }
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dirtyRef.current || !imageRef.current) return;
      dirtyRef.current = false;
      engine.render(
        shapesRef.current,
        imageRef.current.bitmap.width,
        imageRef.current.bitmap.height,
      );
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // image -> texture upload + rescale configs to the new image size
  useEffect(() => {
    imageRef.current = image;
    const engine = engineRef.current;
    if (!engine || !image) return;
    engine.setImage(image.bitmap, true);

    const ratio = image.bitmap.height / lastImageHeightRef.current;
    lastImageHeightRef.current = image.bitmap.height;
    if (ratio !== 1) {
      setShapes((prev) =>
        prev.map((s) => ({
          ...s,
          cx: s.cx * ratio,
          cy: s.cy * ratio,
          w: s.w * ratio,
          h: s.h * ratio,
          material: scaleMaterial(s.material, ratio),
        })),
      );
      const panel = panelRef.current;
      const patch: Record<string, number> = {};
      for (const key of LENGTH_KNOBS) {
        panel[key] *= ratio;
        patch[key] = panel[key];
      }
      set(patch);
    }
    if (shapesRef.current.length === 0) {
      addShapeAt(image.bitmap.width / 2, image.bitmap.height / 2);
    }
    dirtyRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, set]);

  // stage size -> canvas fit
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const compute = () => {
      const img = imageRef.current;
      if (!img) {
        setFit({ w: 0, h: 0 });
        return;
      }
      const pad = 28;
      const cw = Math.max(el.clientWidth - pad * 2, 50);
      const ch = Math.max(el.clientHeight - pad * 2, 50);
      const k = Math.min(cw / img.bitmap.width, ch / img.bitmap.height);
      setFit({ w: img.bitmap.width * k, h: img.bitmap.height * k });
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    compute();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [image]);

  // fit -> canvas device size
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || fit.w < 1 || fit.h < 1) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(fit.w * dpr));
    canvas.height = Math.max(1, Math.round(fit.h * dpr));
    engine.resize(canvas.width, canvas.height);
    dirtyRef.current = true;
  }, [fit]);

  const loadFile = useCallback(async (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setImage((prev) => {
        prev?.bitmap.close();
        return { bitmap, name: file.name };
      });
      setSelectedId(null);
    } catch (err) {
      alert(`Could not load image: ${err}`);
    }
  }, []);

  const addShapeAt = useCallback((cx: number, cy: number, w?: number, h?: number) => {
    const img = imageRef.current;
    if (!img) return;
    const panel = panelRef.current;
    const shape: GlassShape = {
      id: crypto.randomUUID(),
      cx,
      cy,
      w: w ?? Math.max(48, img.bitmap.width * 0.3),
      h: h ?? Math.max(48, img.bitmap.height * 0.22),
      radiusPct: panel.cornerRadius,
      roundness: panel.roundness,
      scaleWithSize: panel.scaleWithSize,
      material: materialFromPanel(panel),
    };
    setShapes((prev) => [...prev, shape]);
    setSelectedId(shape.id);
  }, []);

  // Geometry patches from dragging. Resizing also rescales the bubble's
  // rim/shadow lengths (unless its "scale w/ size" toggle is off).
  const patchShape = useCallback((id: string, patch: Partial<GlassShape>) => {
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (s.scaleWithSize !== false && (patch.w !== undefined || patch.h !== undefined)) {
          const ratio = Math.min(next.w, next.h) / Math.min(s.w, s.h);
          if (Number.isFinite(ratio) && ratio > 0 && ratio !== 1) {
            const m = { ...next.material, tint: { ...next.material.tint } };
            for (const k of SIZE_SCALED_KNOBS) m[k] *= ratio;
            next.material = m;
          }
        }
        return next;
      }),
    );
  }, []);

  const applyPreset = useCallback(
    (preset: PresetSpec) => {
      const img = imageRef.current;
      if (!img) return;
      const id = selectedIdRef.current;
      if (id) {
        const cur = shapesRef.current.find((s) => s.id === id);
        if (!cur) return;
        const updated = applyPresetToShape(cur, preset, img.bitmap.height);
        setShapes((prev) => prev.map((s) => (s.id === id ? updated : s)));
        syncPanelFromShape(updated);
      } else {
        // nothing selected: stamp a new centered bubble with this preset
        const base: GlassShape = {
          id: crypto.randomUUID(),
          cx: img.bitmap.width / 2,
          cy: img.bitmap.height / 2,
          w: Math.max(48, img.bitmap.width * 0.3),
          h: Math.max(48, img.bitmap.height * 0.22),
          radiusPct: panelRef.current.cornerRadius,
          roundness: panelRef.current.roundness,
          scaleWithSize: panelRef.current.scaleWithSize,
          material: materialFromPanel(panelRef.current),
        };
        const shaped = applyPresetToShape(base, preset, img.bitmap.height);
        setShapes((prev) => [...prev, shaped]);
        setSelectedId(shaped.id);
      }
    },
    [syncPanelFromShape],
  );

  const addShapeCentered = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    addShapeAt(img.bitmap.width / 2, img.bitmap.height / 2);
  }, [addShapeAt]);

  const alignSelected = useCallback(
    (action: 'left' | 'centerH' | 'right' | 'top' | 'middle' | 'bottom') => {
      const img = imageRef.current;
      const id = selectedIdRef.current;
      if (!img || !id) return;
      const W = img.bitmap.width;
      const H = img.bitmap.height;
      setShapes((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          switch (action) {
            case 'left':
              return { ...s, cx: s.w / 2 };
            case 'centerH':
              return { ...s, cx: W / 2 };
            case 'right':
              return { ...s, cx: W - s.w / 2 };
            case 'top':
              return { ...s, cy: s.h / 2 };
            case 'middle':
              return { ...s, cy: H / 2 };
            case 'bottom':
              return { ...s, cy: H - s.h / 2 };
          }
        }),
      );
    },
    [],
  );

  // keyboard: delete, nudge, duplicate, deselect
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const id = selectedIdRef.current;
      if (e.key === 'Escape') {
        setSelectedId(null);
        return;
      }
      if (!id) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setShapes((prev) => prev.filter((s) => s.id !== id));
        setSelectedId(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShapes((prev) => {
          const src = prev.find((s) => s.id === id);
          if (!src) return prev;
          const copy: GlassShape = {
            ...src,
            id: crypto.randomUUID(),
            cx: src.cx + src.w * 0.15,
            cy: src.cy + src.h * 0.15,
            material: { ...src.material, tint: { ...src.material.tint } },
          };
          queueMicrotask(() => setSelectedId(copy.id));
          return [...prev, copy];
        });
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setShapes((prev) =>
          prev.map((s) => (s.id === id ? { ...s, cx: s.cx + dx, cy: s.cy + dy } : s)),
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // paste image
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (file) loadFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  const onExport = useCallback(async () => {
    const img = imageRef.current;
    if (!img || exporting) return;
    setExporting(true);
    await new Promise((r) => setTimeout(r, 30)); // let the button repaint
    try {
      const base = img.name.replace(/\.[^.]+$/, '') || 'image';
      const ext = exportSettings.format === 'png' ? 'png' : 'jpg';
      await exportComposite({
        bitmap: img.bitmap,
        shapes: shapesRef.current,
        format: exportSettings.format,
        quality: exportSettings.jpegQuality,
        fileName: `${base}-glass.${ext}`,
      });
    } catch (err) {
      alert(`Export failed: ${err}`);
    } finally {
      setExporting(false);
    }
  }, [exporting, exportSettings]);

  const scale = image ? fit.h / image.bitmap.height : 1;

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">Blur Studio</span>
        <button onClick={() => fileInputRef.current?.click()}>Open image…</button>
        <button onClick={addShapeCentered} disabled={!image}>
          + Add glass
        </button>
        <span className="toolbar-group" role="group" aria-label="Align selected">
          {(
            [
              ['left', 'Align left', <AlignIcon key="l" kind="left" />],
              ['centerH', 'Center horizontally', <AlignIcon key="ch" kind="centerH" />],
              ['right', 'Align right', <AlignIcon key="r" kind="right" />],
              ['top', 'Align top', <AlignIcon key="t" kind="top" />],
              ['middle', 'Center vertically', <AlignIcon key="cv" kind="middle" />],
              ['bottom', 'Align bottom', <AlignIcon key="b" kind="bottom" />],
            ] as const
          ).map(([action, title, icon]) => (
            <button
              key={action}
              className="icon"
              title={title}
              disabled={!selectedId}
              onClick={() => alignSelected(action)}
            >
              {icon}
            </button>
          ))}
        </span>
        <button className="primary" onClick={onExport} disabled={!image || exporting}>
          {exporting ? 'Exporting…' : `Export ${exportSettings.format.toUpperCase()}`}
        </button>
        {image && (
          <span className="meta">
            {image.name} · {image.bitmap.width}×{image.bitmap.height}
          </span>
        )}
        <span className="hint">
          double-click canvas: add · drag: move/resize · ⌫: delete · ⌘D: duplicate
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            loadFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </header>

      <div className="presetbar">
        <span className="presetbar-title">Presets</span>
        {PRESETS.map((p) => (
          <button key={p.id} title={p.hint} disabled={!image} onClick={() => applyPreset(p)}>
            {p.label}
          </button>
        ))}
        <span className="presetbar-note">
          applies to the selected bubble — or stamps a new one
        </span>
      </div>

      <div
        className="stage"
        ref={stageRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          loadFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div
          className="canvas-wrap"
          style={{ width: fit.w, height: fit.h, display: image ? undefined : 'none' }}
        >
          <canvas ref={canvasRef} />
          {image && (
            <GlassBoxes
              shapes={shapes}
              selectedId={selectedId}
              scale={scale}
              onSelect={setSelectedId}
              onPatch={patchShape}
              onDragEnd={() => {
                const s = shapesRef.current.find((x) => x.id === selectedIdRef.current);
                if (s) syncPanelFromShape(s);
              }}
              onAddAt={addShapeAt}
            />
          )}
        </div>
        {!image && (
          <button className="dropzone" onClick={() => fileInputRef.current?.click()}>
            <strong>Drop a photo here</strong>
            <span>or click to browse · or paste from clipboard</span>
          </button>
        )}
      </div>
    </div>
  );
}
