export interface MaterialSettings {
  blurRadius: number;
  blurEdge: boolean;
  thickness: number;
  refFactor: number;
  dispersion: number;
  fresnelRange: number;
  fresnelHardness: number;
  fresnelFactor: number;
  glareRange: number;
  glareHardness: number;
  glareFactor: number;
  glareConvergence: number;
  glareOppositeFactor: number;
  glareAngle: number;
  tint: { r: number; g: number; b: number; a: number };
  shadowExpand: number;
  shadowFactor: number;
  shadowX: number;
  shadowY: number;
}

export interface GlassShape {
  id: string;
  /** center x, image px (top-left origin) */
  cx: number;
  /** center y, image px (top-left origin) */
  cy: number;
  /** width, image px */
  w: number;
  /** height, image px */
  h: number;
  /** corner radius as % of min(w,h)/2 */
  radiusPct: number;
  /** superellipse exponent for corners (2 = circular, 7 = squircle-ish) */
  roundness: number;
  /** rescale rim/shadow lengths when the box is resized (default true) */
  scaleWithSize?: boolean;
  /** every bubble carries its own full material config */
  material: MaterialSettings;
}

/** Material knobs that track the bubble's size when it is resized. */
export const SIZE_SCALED_KNOBS = [
  'thickness',
  'fresnelRange',
  'glareRange',
  'shadowExpand',
  'shadowX',
  'shadowY',
] as const;

export const DEFAULT_MATERIAL: MaterialSettings = {
  blurRadius: 60,
  blurEdge: true,
  thickness: 30,
  refFactor: 1.4,
  dispersion: 7,
  fresnelRange: 30,
  fresnelHardness: 20,
  fresnelFactor: 20,
  glareRange: 30,
  glareHardness: 20,
  glareFactor: 90,
  glareConvergence: 50,
  glareOppositeFactor: 80,
  glareAngle: -45,
  tint: { r: 255, g: 255, b: 255, a: 0 },
  shadowExpand: 25,
  shadowFactor: 15,
  shadowX: 0,
  shadowY: 10,
};

/** Material knobs that are lengths in image pixels (rescaled when a new image loads). */
export const LENGTH_KNOBS = [
  'blurRadius',
  'thickness',
  'fresnelRange',
  'glareRange',
  'shadowExpand',
  'shadowX',
  'shadowY',
] as const;

export function materialEquals(a: MaterialSettings, b: MaterialSettings): boolean {
  return (
    a.blurRadius === b.blurRadius &&
    a.blurEdge === b.blurEdge &&
    a.thickness === b.thickness &&
    a.refFactor === b.refFactor &&
    a.dispersion === b.dispersion &&
    a.fresnelRange === b.fresnelRange &&
    a.fresnelHardness === b.fresnelHardness &&
    a.fresnelFactor === b.fresnelFactor &&
    a.glareRange === b.glareRange &&
    a.glareHardness === b.glareHardness &&
    a.glareFactor === b.glareFactor &&
    a.glareConvergence === b.glareConvergence &&
    a.glareOppositeFactor === b.glareOppositeFactor &&
    a.glareAngle === b.glareAngle &&
    a.tint.r === b.tint.r &&
    a.tint.g === b.tint.g &&
    a.tint.b === b.tint.b &&
    a.tint.a === b.tint.a &&
    a.shadowExpand === b.shadowExpand &&
    a.shadowFactor === b.shadowFactor &&
    a.shadowX === b.shadowX &&
    a.shadowY === b.shadowY
  );
}
