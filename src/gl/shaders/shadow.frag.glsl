#version 300 es

// Shadow pass: darkens the scene under one glass shape.
// Adapted from liquid-glass-studio's background pass (MIT, Charles Yin).
//
// Unit convention (all passes): shape geometry and length-like uniforms are
// in IMAGE pixels; u_dpr is device px per image px (1.0 at export).

precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform vec2 u_resolution; // render target size, device px
uniform float u_dpr;
uniform vec4 u_shape; // cx, cy (image px, GL origin), w, h (image px)
uniform vec2 u_shapeParams; // corner radius (image px), roundness
uniform float u_shadowExpand; // image px
uniform float u_shadowFactor; // 0..1
uniform vec2 u_shadowPosition; // image px, GL axis (y up)

float superellipseCornerSDF(vec2 p, float r, float n) {
  p = abs(p);
  float v = pow(pow(p.x, n) + pow(p.y, n), 1.0 / n);
  return v - r;
}

// p relative to center, device px; sizes image px
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

void main() {
  vec3 color = texture(u_scene, v_uv).rgb;

  vec2 p = gl_FragCoord.xy - u_shadowPosition * u_dpr - u_shape.xy * u_dpr;
  float d = roundedRectSDF(p, u_shape.z, u_shape.w, u_shapeParams.x, u_shapeParams.y);
  float nd = abs(d) / u_dpr; // image px
  float shadow = exp(-1.0 / u_shadowExpand * nd) * 0.6 * u_shadowFactor;

  fragColor = vec4(color - vec3(shadow), 1.0);
}
