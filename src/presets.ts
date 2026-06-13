import { DEFAULT_MATERIAL, type GlassShape, type MaterialSettings } from './types';

export interface PresetResult {
  material: MaterialSettings;
  radiusPct: number;
  roundness: number;
}

export interface PresetSpec {
  id: string;
  label: string;
  hint: string;
  /**
   * Presets are size-relative: lengths are computed from the bubble's
   * min dimension (rim, shadow) and the image height (blur), so the same
   * preset looks right on a chip or a full-width panel, on any photo size.
   */
  build: (minDim: number, imageH: number) => PresetResult;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function mat(overrides: Partial<MaterialSettings>): MaterialSettings {
  return { ...DEFAULT_MATERIAL, tint: { ...DEFAULT_MATERIAL.tint }, ...overrides };
}

export const PRESETS: PresetSpec[] = [
  {
    id: 'frosted',
    label: 'Frosted',
    hint: 'Classic frosted glass panel',
    build: (m, H) => ({
      radiusPct: 35,
      roundness: 5,
      material: mat({
        blurRadius: r1(H * 0.045),
        blurEdge: true,
        thickness: r1(m * 0.1),
        refFactor: 1.35,
        dispersion: 4,
        fresnelRange: r1(m * 0.25),
        fresnelHardness: 15,
        fresnelFactor: 25,
        glareRange: r1(m * 0.25),
        glareHardness: 20,
        glareFactor: 60,
        tint: { r: 255, g: 255, b: 255, a: 0.18 },
        shadowExpand: r1(m * 0.18),
        shadowFactor: 18,
        shadowX: 0,
        shadowY: r1(m * 0.04),
      }),
    }),
  },
  {
    id: 'heavy',
    label: 'Heavy frost',
    hint: 'Strong privacy blur',
    build: (m, H) => ({
      radiusPct: 35,
      roundness: 5,
      material: mat({
        blurRadius: r1(H * 0.09),
        blurEdge: true,
        thickness: r1(m * 0.07),
        refFactor: 1.3,
        dispersion: 3,
        fresnelRange: r1(m * 0.2),
        fresnelFactor: 15,
        glareRange: r1(m * 0.2),
        glareFactor: 40,
        tint: { r: 255, g: 255, b: 255, a: 0.35 },
        shadowExpand: r1(m * 0.2),
        shadowFactor: 22,
        shadowX: 0,
        shadowY: r1(m * 0.04),
      }),
    }),
  },
  {
    id: 'veil',
    label: 'Subtle veil',
    hint: 'Barely-there blur',
    build: (m, H) => ({
      radiusPct: 30,
      roundness: 5,
      material: mat({
        blurRadius: r1(H * 0.018),
        blurEdge: true,
        thickness: r1(m * 0.05),
        refFactor: 1.25,
        dispersion: 2,
        fresnelRange: r1(m * 0.18),
        fresnelFactor: 10,
        glareRange: r1(m * 0.18),
        glareFactor: 25,
        tint: { r: 255, g: 255, b: 255, a: 0.08 },
        shadowExpand: r1(m * 0.12),
        shadowFactor: 8,
        shadowX: 0,
        shadowY: r1(m * 0.03),
      }),
    }),
  },
  {
    id: 'lens',
    label: 'Clear lens',
    hint: 'Highlight: no blur, pure refraction',
    build: (m) => ({
      radiusPct: 45,
      roundness: 4,
      material: mat({
        blurRadius: 0,
        blurEdge: false,
        thickness: r1(m * 0.18),
        refFactor: 1.6,
        dispersion: 12,
        fresnelRange: r1(m * 0.3),
        fresnelHardness: 25,
        fresnelFactor: 35,
        glareRange: r1(m * 0.3),
        glareHardness: 25,
        glareFactor: 80,
        tint: { r: 255, g: 255, b: 255, a: 0 },
        shadowExpand: r1(m * 0.2),
        shadowFactor: 20,
        shadowX: 0,
        shadowY: r1(m * 0.05),
      }),
    }),
  },
  {
    id: 'highlight',
    label: 'Highlight',
    hint: 'Highlight: brighten and lift an area',
    build: (m) => ({
      radiusPct: 100,
      roundness: 5,
      material: mat({
        blurRadius: 0,
        blurEdge: false,
        thickness: r1(m * 0.08),
        refFactor: 1.15,
        dispersion: 3,
        fresnelRange: r1(m * 0.35),
        fresnelHardness: 35,
        fresnelFactor: 45,
        glareRange: r1(m * 0.35),
        glareHardness: 30,
        glareFactor: 70,
        glareConvergence: 40,
        tint: { r: 255, g: 255, b: 255, a: 0.22 },
        shadowExpand: r1(m * 0.25),
        shadowFactor: 22,
        shadowX: 0,
        shadowY: r1(m * 0.05),
      }),
    }),
  },
  {
    id: 'dim',
    label: 'Dim panel',
    hint: 'Darken behind captions',
    build: (m, H) => ({
      radiusPct: 25,
      roundness: 4,
      material: mat({
        blurRadius: r1(H * 0.05),
        blurEdge: true,
        thickness: r1(m * 0.06),
        refFactor: 1.3,
        dispersion: 2,
        fresnelRange: r1(m * 0.18),
        fresnelFactor: 8,
        glareRange: r1(m * 0.18),
        glareFactor: 20,
        tint: { r: 0, g: 0, b: 0, a: 0.35 },
        shadowExpand: r1(m * 0.12),
        shadowFactor: 10,
        shadowX: 0,
        shadowY: r1(m * 0.03),
      }),
    }),
  },
  {
    id: 'orb',
    label: 'Bubble',
    hint: 'Playful orb with heavy dispersion',
    build: (m, H) => ({
      radiusPct: 100,
      roundness: 2.2,
      material: mat({
        blurRadius: r1(H * 0.02),
        blurEdge: false,
        thickness: r1(m * 0.3),
        refFactor: 1.8,
        dispersion: 20,
        fresnelRange: r1(m * 0.3),
        fresnelFactor: 30,
        glareRange: r1(m * 0.35),
        glareFactor: 100,
        glareConvergence: 70,
        tint: { r: 255, g: 255, b: 255, a: 0.05 },
        shadowExpand: r1(m * 0.25),
        shadowFactor: 25,
        shadowX: 0,
        shadowY: r1(m * 0.06),
      }),
    }),
  },
];

export function applyPresetToShape(shape: GlassShape, preset: PresetSpec, imageH: number): GlassShape {
  const spec = preset.build(Math.min(shape.w, shape.h), imageH);
  return {
    ...shape,
    radiusPct: spec.radiusPct,
    roundness: spec.roundness,
    material: spec.material,
  };
}
