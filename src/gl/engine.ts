/**
 * Layered liquid-glass compositor.
 *
 * Render order per frame:
 *   photo -> [for each shape: shadow -> gaussian blur (v+h) -> glass] -> copy to screen
 *
 * Each shape carries its own full material config (blur radius, refraction,
 * fresnel, glare, tint, shadow), so every bubble can look different. A shape's
 * "background" is the scene composited so far, which means glass stacked on
 * glass refracts correctly.
 *
 * Unit convention: shape geometry and length-like materials are in IMAGE
 * pixels; the engine renders at any device resolution and scales internally
 * (u_dpr = device px per image px), so an on-screen preview and a
 * full-resolution export produce the same picture.
 *
 * GL plumbing adapted from liquid-glass-studio (MIT, Charles Yin).
 */

import type { GlassShape, MaterialSettings } from '../types';

import vertexSrc from './shaders/vertex.glsl?raw';
import photoFrag from './shaders/photo.frag.glsl?raw';
import shadowFrag from './shaders/shadow.frag.glsl?raw';
import blurFrag from './shaders/blur.frag.glsl?raw';
import glassFrag from './shaders/glass.frag.glsl?raw';
import copyFrag from './shaders/copy.frag.glsl?raw';

/** Gaussian taps are capped; larger radii blur at reduced resolution instead. */
const MAX_TAP_RADIUS = 80;

type UniformValue = number | boolean | number[] | Float32Array | WebGLTexture | null | undefined;

interface ProgramInfo {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uniforms: Map<string, { location: WebGLUniformLocation; type: number; isArray: boolean }>;
}

interface Target {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

export class GlassEngine {
  readonly gl: WebGL2RenderingContext;
  private programs: Record<'photo' | 'shadow' | 'blur' | 'glass' | 'copy', ProgramInfo>;
  private scene: [Target | null, Target | null] = [null, null];
  private blurTargets = new Map<number, [Target, Target]>();
  private width = 0;
  private height = 0;
  private useFloat: boolean;
  private imageTexture: WebGLTexture | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.useFloat = !!gl.getExtension('EXT_color_buffer_float');

    this.programs = {
      photo: this.buildProgram(photoFrag),
      shadow: this.buildProgram(shadowFrag),
      blur: this.buildProgram(blurFrag),
      glass: this.buildProgram(glassFrag),
      copy: this.buildProgram(copyFrag),
    };
  }

  private buildProgram(fragmentSrc: string): ProgramInfo {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uniforms: ProgramInfo['uniforms'] = new Map();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const location = gl.getUniformLocation(program, info.name);
      if (!location) continue;
      uniforms.set(info.name.replace(/\[\d+\]$/, ''), {
        location,
        type: info.type,
        isArray: /\[\d+\]$/.test(info.name),
      });
    }

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    return { program, vao, uniforms };
  }

  private createTarget(width: number, height: number): Target {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (this.useFloat) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('Failed to create framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete: ${status}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { fbo, texture, width, height };
  }

  private disposeTarget(target: Target | null): void {
    if (!target) return;
    this.gl.deleteFramebuffer(target.fbo);
    this.gl.deleteTexture(target.texture);
  }

  resize(width: number, height: number): void {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.disposeTarget(this.scene[0]);
    this.disposeTarget(this.scene[1]);
    this.scene = [this.createTarget(width, height), this.createTarget(width, height)];
    for (const [a, b] of this.blurTargets.values()) {
      this.disposeTarget(a);
      this.disposeTarget(b);
    }
    this.blurTargets.clear();
  }

  /** Upload (or replace) the photo texture. Pass null to clear. */
  setImage(source: TexImageSource | null, withMipmaps: boolean): void {
    const gl = this.gl;
    if (this.imageTexture) {
      gl.deleteTexture(this.imageTexture);
      this.imageTexture = null;
    }
    if (!source) return;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // no UNPACK_FLIP_Y here: it is ignored for ImageBitmap sources, so the
    // photo pass samples with a flipped v_uv.y instead
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (withMipmaps) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.imageTexture = texture;
  }

  private getBlurTargets(scale: number): [Target, Target] {
    const cached = this.blurTargets.get(scale);
    if (cached) return cached;
    const w = Math.max(1, Math.round(this.width * scale));
    const h = Math.max(1, Math.round(this.height * scale));
    const pair: [Target, Target] = [this.createTarget(w, h), this.createTarget(w, h)];
    this.blurTargets.set(scale, pair);
    return pair;
  }

  private runPass(
    info: ProgramInfo,
    target: Target | null, // null = screen
    uniforms: Record<string, UniformValue>,
  ): void {
    const gl = this.gl;
    const w = target ? target.width : this.width;
    const h = target ? target.height : this.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(info.program);

    let textureUnit = 0;
    for (const [name, value] of Object.entries({ ...uniforms, u_passResolution: [w, h] })) {
      if (value === null || value === undefined) continue;
      const u = info.uniforms.get(name);
      if (!u) continue;
      if (value instanceof WebGLTexture) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, value);
        gl.uniform1i(u.location, textureUnit);
        textureUnit += 1;
        continue;
      }
      const v = value as number | boolean | number[] | Float32Array;
      switch (u.type) {
        case gl.FLOAT:
          if (typeof v === 'number') {
            gl.uniform1f(u.location, v);
          } else if (typeof v !== 'boolean') {
            gl.uniform1fv(u.location, v);
          }
          break;
        case gl.FLOAT_VEC2:
          gl.uniform2fv(u.location, v as number[] | Float32Array);
          break;
        case gl.FLOAT_VEC3:
          gl.uniform3fv(u.location, v as number[] | Float32Array);
          break;
        case gl.FLOAT_VEC4:
          gl.uniform4fv(u.location, v as number[] | Float32Array);
          break;
        case gl.INT:
        case gl.BOOL:
        case gl.SAMPLER_2D:
          gl.uniform1i(u.location, typeof v === 'boolean' ? (v ? 1 : 0) : (v as number));
          break;
      }
    }

    gl.bindVertexArray(info.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /** Composite the photo and all glass shapes to the canvas. */
  render(shapes: GlassShape[], imageW: number, imageH: number): void {
    void imageW;
    if (this.width === 0 || this.height === 0 || !this.scene[0]) return;
    const scale = this.height / imageH; // device px per image px (u_dpr)
    const resolution = [this.width, this.height];

    this.runPass(this.programs.photo, this.scene[0], {
      u_dpr: scale,
      u_image: this.imageTexture,
      u_imageReady: this.imageTexture ? 1 : 0,
    });

    let cur = 0; // index into this.scene holding the current composite
    for (const shape of shapes) {
      const m: MaterialSettings = shape.material;
      const shapeUniforms = {
        u_resolution: resolution,
        u_dpr: scale,
        u_shape: [shape.cx, imageH - shape.cy, shape.w, shape.h],
        u_shapeParams: [
          (Math.min(shape.w, shape.h) / 2) * (shape.radiusPct / 100),
          shape.roundness,
        ],
      };

      let sharp = cur;
      if (m.shadowFactor > 0) {
        this.runPass(this.programs.shadow, this.scene[1 - cur], {
          ...shapeUniforms,
          u_scene: this.scene[cur]!.texture,
          u_shadowExpand: Math.max(m.shadowExpand, 0.5),
          u_shadowFactor: m.shadowFactor / 100,
          u_shadowPosition: [m.shadowX, -m.shadowY],
        });
        sharp = 1 - cur;
      }
      const sharpTexture = this.scene[sharp]!.texture;

      let blurredTexture = sharpTexture;
      const radiusDevice = m.blurRadius * scale;
      if (radiusDevice >= 0.5) {
        // quantized power-of-two downscale keeps taps <= MAX_TAP_RADIUS
        const blurScale =
          radiusDevice <= MAX_TAP_RADIUS
            ? 1
            : Math.pow(2, -Math.ceil(Math.log2(radiusDevice / MAX_TAP_RADIUS)));
        const [ta, tb] = this.getBlurTargets(blurScale);
        const passRadius = Math.max(1, Math.round(radiusDevice * blurScale));
        this.runPass(this.programs.blur, ta, {
          u_prevPassTexture: sharpTexture,
          u_direction: [0, 1],
          u_blurRadius: passRadius,
        });
        this.runPass(this.programs.blur, tb, {
          u_prevPassTexture: ta.texture,
          u_direction: [1, 0],
          u_blurRadius: passRadius,
        });
        blurredTexture = tb.texture;
      }

      const target = sharp === cur ? 1 - cur : cur;
      this.runPass(this.programs.glass, this.scene[target], {
        ...shapeUniforms,
        u_bg: sharpTexture,
        u_blurredBg: blurredTexture,
        u_tint: [m.tint.r / 255, m.tint.g / 255, m.tint.b / 255, m.tint.a],
        u_refThickness: Math.max(m.thickness, 1),
        u_refFactor: m.refFactor,
        u_refDispersion: m.dispersion,
        u_refFresnelRange: Math.max(m.fresnelRange, 1),
        u_refFresnelHardness: m.fresnelHardness / 100,
        u_refFresnelFactor: m.fresnelFactor / 100,
        u_glareRange: Math.max(m.glareRange, 1),
        u_glareHardness: m.glareHardness / 100,
        u_glareConvergence: m.glareConvergence / 100,
        u_glareOppositeFactor: m.glareOppositeFactor / 100,
        u_glareFactor: m.glareFactor / 100,
        u_glareAngle: (m.glareAngle * Math.PI) / 180,
        u_blurEdge: m.blurEdge ? 1 : 0,
      });
      cur = target;
    }

    this.runPass(this.programs.copy, null, { u_scene: this.scene[cur]!.texture });
  }

  dispose(): void {
    const gl = this.gl;
    for (const info of Object.values(this.programs)) {
      gl.deleteProgram(info.program);
      gl.deleteVertexArray(info.vao);
    }
    this.disposeTarget(this.scene[0]);
    this.disposeTarget(this.scene[1]);
    for (const [a, b] of this.blurTargets.values()) {
      this.disposeTarget(a);
      this.disposeTarget(b);
    }
    this.blurTargets.clear();
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
