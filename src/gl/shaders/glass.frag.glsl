#version 300 es

// Glass composite pass for ONE shape: refraction with chromatic dispersion,
// fresnel rim, glare highlight and tint, driven by the shape's SDF.
// Adapted from liquid-glass-studio (MIT, Charles Yin) — the final render path
// of fragment-main.glsl — made render-scale invariant so the preview and the
// full-resolution export match, and layered so each shape carries its own
// material settings (the "background" here includes previously composited
// glass shapes).

precision highp float;

#define PI (3.14159265359)

const float N_R = 1.0 - 0.02;
const float N_G = 1.0;
const float N_B = 1.0 + 0.02;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_blurredBg;
uniform sampler2D u_bg;
uniform vec2 u_resolution; // render target size, device px
uniform float u_dpr; // device px per image px

uniform vec4 u_shape; // cx, cy (image px, GL origin), w, h (image px)
uniform vec2 u_shapeParams; // corner radius (image px), roundness

uniform vec4 u_tint;
uniform float u_refThickness; // image px
uniform float u_refFactor;
uniform float u_refDispersion;
uniform float u_refFresnelRange; // image px
uniform float u_refFresnelFactor;
uniform float u_refFresnelHardness;
uniform float u_glareRange; // image px
uniform float u_glareConvergence;
uniform float u_glareOppositeFactor;
uniform float u_glareFactor;
uniform float u_glareHardness;
uniform float u_glareAngle;
uniform int u_blurEdge;

float superellipseCornerSDF(vec2 p, float r, float n) {
  p = abs(p);
  float v = pow(pow(p.x, n) + pow(p.y, n), 1.0 / n);
  return v - r;
}

float roundedRectSDF(vec2 p, float width, float height, float cornerRadius, float n) {
  float cr = cornerRadius * u_dpr;
  vec2 size = vec2(width, height) * u_dpr;
  vec2 d = abs(p) - size * 0.5;

  if (d.x > -cr && d.y > -cr) {
    vec2 cornerCenter = sign(p) * (size * 0.5 - vec2(cr));
    return superellipseCornerSDF(p - cornerCenter, cr, n);
  }
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// p in device px; returns signed distance in device px
float shapeSDF(vec2 p) {
  return roundedRectSDF(p - u_shape.xy * u_dpr, u_shape.z, u_shape.w, u_shapeParams.x, u_shapeParams.y);
}

// Screen-space SDF gradient, magnitude ~1 (resolution independent).
vec2 getNormal(vec2 p) {
  vec2 h = vec2(max(abs(dFdx(p.x)), 0.0001), max(abs(dFdy(p.y)), 0.0001));
  return vec2(
    shapeSDF(p + vec2(h.x, 0.0)) - shapeSDF(p - vec2(h.x, 0.0)),
    shapeSDF(p + vec2(0.0, h.y)) - shapeSDF(p - vec2(0.0, h.y))
  ) /
  (2.0 * h);
}

// --- color space helpers, from https://github.com/Rachmanin0xFF/GLSL-Color-Functions (MIT)
const vec3 D65_WHITE = vec3(0.95045592705, 1.0, 1.08905775076);
const mat3 RGB_TO_XYZ_M = mat3(
  0.4124, 0.3576, 0.1805,
  0.2126, 0.7152, 0.0722,
  0.0193, 0.1192, 0.9505
);
const mat3 XYZ_TO_RGB_M = mat3(
  3.2406255, -1.537208, -0.4986286,
  -0.9689307, 1.8757561, 0.0415175,
  0.0557101, -0.2040211, 1.0569959
);
float UNCOMPAND_SRGB(float a) {
  return a > 0.04045 ? pow((a + 0.055) / 1.055, 2.4) : a / 12.92;
}
float COMPAND_RGB(float a) {
  return a <= 0.0031308 ? 12.92 * a : 1.055 * pow(a, 0.41666666666) - 0.055;
}
vec3 SRGB_TO_RGB(vec3 srgb) {
  return vec3(UNCOMPAND_SRGB(srgb.x), UNCOMPAND_SRGB(srgb.y), UNCOMPAND_SRGB(srgb.z));
}
vec3 RGB_TO_SRGB(vec3 rgb) {
  return vec3(COMPAND_RGB(rgb.x), COMPAND_RGB(rgb.y), COMPAND_RGB(rgb.z));
}
float XYZ_TO_LAB_F(float x) {
  return x > 0.00885645167 ? pow(x, 0.333333333) : 7.78703703704 * x + 0.13793103448;
}
vec3 XYZ_TO_LAB(vec3 xyz) {
  vec3 s = xyz / D65_WHITE;
  s = vec3(XYZ_TO_LAB_F(s.x), XYZ_TO_LAB_F(s.y), XYZ_TO_LAB_F(s.z));
  return vec3(116.0 * s.y - 16.0, 500.0 * (s.x - s.y), 200.0 * (s.y - s.z));
}
vec3 SRGB_TO_LCH(vec3 srgb) {
  vec3 lab = XYZ_TO_LAB(SRGB_TO_RGB(srgb) * RGB_TO_XYZ_M);
  return vec3(lab.x, sqrt(dot(lab.yz, lab.yz)), atan(lab.z, lab.y) * 57.2957795131);
}
float LAB_TO_XYZ_F(float x) {
  return x > 0.206897 ? x * x * x : 0.12841854934 * (x - 0.137931034);
}
vec3 LCH_TO_SRGB(vec3 lch) {
  vec3 lab = vec3(
    lch.x,
    lch.y * cos(lch.z * 0.01745329251),
    lch.y * sin(lch.z * 0.01745329251)
  );
  float w = (lab.x + 16.0) / 116.0;
  vec3 xyz = D65_WHITE *
    vec3(LAB_TO_XYZ_F(w + lab.y / 500.0), LAB_TO_XYZ_F(w), LAB_TO_XYZ_F(w - lab.z / 200.0));
  return RGB_TO_SRGB(xyz * XYZ_TO_RGB_M);
}

float vec2ToAngle(vec2 v) {
  float angle = atan(v.y, v.x);
  if (angle < 0.0) angle += 2.0 * PI;
  return angle;
}

vec4 getTextureDispersion(
  sampler2D tex1,
  sampler2D tex2,
  float mixRate,
  vec2 offset,
  float factor
) {
  vec4 pixel = vec4(1.0);

  float bgR = texture(tex1, v_uv + offset * (1.0 - (N_R - 1.0) * factor)).r;
  float bgG = texture(tex1, v_uv + offset * (1.0 - (N_G - 1.0) * factor)).g;
  float bgB = texture(tex1, v_uv + offset * (1.0 - (N_B - 1.0) * factor)).b;

  float blurR = texture(tex2, v_uv + offset * (1.0 - (N_R - 1.0) * factor)).r;
  float blurG = texture(tex2, v_uv + offset * (1.0 - (N_G - 1.0) * factor)).g;
  float blurB = texture(tex2, v_uv + offset * (1.0 - (N_B - 1.0) * factor)).b;

  pixel.r = mix(bgR, blurR, mixRate);
  pixel.g = mix(bgG, blurG, mixRate);
  pixel.b = mix(bgB, blurB, mixRate);

  return pixel;
}

void main() {
  vec4 bgPixel = texture(u_bg, v_uv);

  float edgePx = shapeSDF(gl_FragCoord.xy); // signed distance, device px
  vec4 outColor = bgPixel;

  if (edgePx < 1.0) {
    float nmerged = -edgePx / u_dpr; // image px, positive inside

    // refraction edge factor from glass thickness profile
    float x_R_ratio = clamp(1.0 - nmerged / u_refThickness, 0.0, 1.0);
    float thetaI = asin(x_R_ratio * x_R_ratio);
    float thetaT = asin(1.0 / u_refFactor * sin(thetaI));
    float edgeFactor = -1.0 * tan(thetaT - thetaI);
    if (nmerged >= u_refThickness) {
      edgeFactor = 0.0;
    }

    if (edgeFactor <= 0.0) {
      outColor = texture(u_blurredBg, v_uv);
      outColor = mix(outColor, vec4(u_tint.rgb, 1.0), u_tint.a * 0.8);
    } else {
      float edgeH = clamp(nmerged / u_refThickness, 0.0, 1.0);
      vec2 normal = getNormal(gl_FragCoord.xy);

      vec4 blurredPixel = getTextureDispersion(
        u_bg,
        u_blurredBg,
        u_blurEdge > 0 ? 1.0 : edgeH,
        -normal * edgeFactor * 0.05 * vec2(u_resolution.y / u_resolution.x, 1.0),
        u_refDispersion
      );

      // basic tint
      outColor = mix(blurredPixel, vec4(u_tint.rgb, 1.0), u_tint.a * 0.8);

      // fresnel rim
      float fresnelFactor = clamp(
        pow(
          1.0 -
            nmerged / 1500.0 * pow(500.0 / u_refFresnelRange, 2.0) +
            u_refFresnelHardness,
          5.0
        ),
        0.0,
        1.0
      );

      vec3 fresnelTintLCH = SRGB_TO_LCH(mix(vec3(1.0), u_tint.rgb, u_tint.a * 0.5));
      fresnelTintLCH.x += 20.0 * fresnelFactor * u_refFresnelFactor;
      fresnelTintLCH.x = clamp(fresnelTintLCH.x, 0.0, 100.0);

      outColor = mix(
        outColor,
        vec4(LCH_TO_SRGB(fresnelTintLCH), 1.0),
        clamp(fresnelFactor * u_refFresnelFactor * 0.7 * length(normal), 0.0, 1.0)
      );

      // glare
      float glareGeoFactor = clamp(
        pow(
          1.0 - nmerged / 1500.0 * pow(500.0 / u_glareRange, 2.0) + u_glareHardness,
          5.0
        ),
        0.0,
        1.0
      );

      float glareAngle = (vec2ToAngle(normalize(normal)) - PI / 4.0 + u_glareAngle) * 2.0;
      int glareFarside = 0;
      if (
        glareAngle > PI * (2.0 - 0.5) && glareAngle < PI * (4.0 - 0.5) ||
        glareAngle < PI * (0.0 - 0.5)
      ) {
        glareFarside = 1;
      }
      float glareAngleFactor =
        (0.5 + sin(glareAngle) * 0.5) *
        (glareFarside == 1 ? 1.2 * u_glareOppositeFactor : 1.2) *
        u_glareFactor;
      glareAngleFactor = clamp(pow(glareAngleFactor, 0.1 + u_glareConvergence * 2.0), 0.0, 1.0);

      vec3 glareTintLCH = SRGB_TO_LCH(mix(blurredPixel.rgb, u_tint.rgb, u_tint.a * 0.5));
      glareTintLCH.x += 150.0 * glareAngleFactor * glareGeoFactor;
      glareTintLCH.y += 30.0 * glareAngleFactor * glareGeoFactor;
      glareTintLCH.x = clamp(glareTintLCH.x, 0.0, 120.0);

      outColor = mix(
        outColor,
        vec4(LCH_TO_SRGB(glareTintLCH), 1.0),
        clamp(glareAngleFactor * glareGeoFactor * length(normal), 0.0, 1.0)
      );
    }
  }

  // anti-aliased edge: ~1.5 device px transition
  outColor = mix(outColor, bgPixel, smoothstep(-0.75, 0.75, edgePx));

  fragColor = vec4(outColor.rgb, 1.0);
}
