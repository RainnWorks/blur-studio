import { folder, useControls } from 'leva';
import { useMemo } from 'react';
import { DEFAULT_MATERIAL } from './types';

export interface ExportSettings {
  format: 'png' | 'jpeg';
  jpegQuality: number;
}

/** Panel keys: all MaterialSettings keys plus per-shape geometry styling. */
export type PanelKey =
  | keyof typeof DEFAULT_MATERIAL
  | 'cornerRadius'
  | 'roundness'
  | 'scaleWithSize';

export type PanelValue = number | boolean | { r: number; g: number; b: number; a: number };

/**
 * The knob panel. Every value (except Export) belongs to the SELECTED bubble —
 * each bubble carries its own full config. `onValue` fires on any knob change;
 * `set` pushes a bubble's config back into the panel when selection changes.
 *
 * Knobs are transient (leva onChange) so panel<->shape syncing can't loop:
 * pushing a value with `set` re-fires onValue with the same value, which the
 * app turns into a no-op via equality checks.
 */
export function useStudioControls(onValue: (key: PanelKey, value: PanelValue) => void) {
  const schema = useMemo(() => {
    const on = (key: PanelKey) => ({
      onChange: (v: PanelValue) => onValue(key, v),
    });
    const d = DEFAULT_MATERIAL;
    return {
      Blur: folder({
        blurRadius: { label: 'radius', min: 0, max: 600, step: 1, value: d.blurRadius, ...on('blurRadius') },
        blurEdge: { label: 'blur edge', value: d.blurEdge, ...on('blurEdge') },
      }),
      Shape: folder({
        cornerRadius: { label: 'corner %', min: 0, max: 100, step: 0.5, value: 80, ...on('cornerRadius') },
        roundness: { label: 'roundness', min: 2, max: 7, step: 0.05, value: 5, ...on('roundness') },
        scaleWithSize: { label: 'scale w/ size', value: true, ...on('scaleWithSize') },
      }),
      Refraction: folder({
        thickness: { label: 'thickness', min: 1, max: 400, step: 0.5, value: d.thickness, ...on('thickness') },
        refFactor: { label: 'index', min: 1, max: 4, step: 0.01, value: d.refFactor, ...on('refFactor') },
        dispersion: { label: 'dispersion', min: 0, max: 50, step: 0.1, value: d.dispersion, ...on('dispersion') },
      }),
      Effect: folder({
        tint: { label: 'tint', value: d.tint, ...on('tint') },
      }),
      Fresnel: folder(
        {
          fresnelRange: { label: 'range', min: 1, max: 500, step: 0.5, value: d.fresnelRange, ...on('fresnelRange') },
          fresnelHardness: { label: 'hardness', min: 0, max: 100, step: 0.5, value: d.fresnelHardness, ...on('fresnelHardness') },
          fresnelFactor: { label: 'strength', min: 0, max: 100, step: 0.5, value: d.fresnelFactor, ...on('fresnelFactor') },
        },
        { collapsed: true },
      ),
      Glare: folder(
        {
          glareRange: { label: 'range', min: 1, max: 500, step: 0.5, value: d.glareRange, ...on('glareRange') },
          glareHardness: { label: 'hardness', min: 0, max: 100, step: 0.5, value: d.glareHardness, ...on('glareHardness') },
          glareFactor: { label: 'strength', min: 0, max: 120, step: 0.5, value: d.glareFactor, ...on('glareFactor') },
          glareConvergence: { label: 'convergence', min: 0, max: 100, step: 0.5, value: d.glareConvergence, ...on('glareConvergence') },
          glareOppositeFactor: { label: 'opposite', min: 0, max: 100, step: 0.5, value: d.glareOppositeFactor, ...on('glareOppositeFactor') },
          glareAngle: { label: 'angle', min: -180, max: 180, step: 1, value: d.glareAngle, ...on('glareAngle') },
        },
        { collapsed: true },
      ),
      Shadow: folder(
        {
          shadowExpand: { label: 'softness', min: 2, max: 400, step: 0.5, value: d.shadowExpand, ...on('shadowExpand') },
          shadowFactor: { label: 'strength', min: 0, max: 100, step: 0.5, value: d.shadowFactor, ...on('shadowFactor') },
          shadowX: { label: 'offset x', min: -200, max: 200, step: 1, value: d.shadowX, ...on('shadowX') },
          shadowY: { label: 'offset y', min: -200, max: 200, step: 1, value: d.shadowY, ...on('shadowY') },
        },
        { collapsed: true },
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [, setRaw] = useControls(() => schema);
  const set = setRaw as unknown as (values: Record<string, unknown>) => void;

  const exportValues = useControls('Export', {
    format: { label: 'format', options: { PNG: 'png', JPEG: 'jpeg' }, value: 'png' },
    jpegQuality: { label: 'jpeg quality', min: 0.5, max: 1, step: 0.01, value: 0.95 },
  }, { collapsed: true });

  const exportSettings: ExportSettings = {
    format: exportValues.format as 'png' | 'jpeg',
    jpegQuality: exportValues.jpegQuality,
  };

  return { set, exportSettings };
}
