#version 300 es

// Separable Gaussian blur. One shader for both directions via u_direction.
// Weights are computed in-shader from the radius so any radius works without
// hitting uniform array limits (important for full-resolution export).

precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_prevPassTexture;
uniform vec2 u_passResolution; // size of THIS pass's render target
uniform int u_blurRadius; // in target px
uniform vec2 u_direction; // (1,0) or (0,1)

void main() {
  if (u_blurRadius < 1) {
    fragColor = texture(u_prevPassTexture, v_uv);
    return;
  }

  float sigma = float(u_blurRadius) / 3.0;
  vec2 texel = u_direction / u_passResolution;

  vec4 acc = texture(u_prevPassTexture, v_uv);
  float total = 1.0;
  for (int i = 1; i <= u_blurRadius; i++) {
    float fi = float(i);
    float w = exp(-0.5 * fi * fi / (sigma * sigma));
    vec2 off = fi * texel;
    acc += (texture(u_prevPassTexture, v_uv + off) + texture(u_prevPassTexture, v_uv - off)) * w;
    total += 2.0 * w;
  }

  fragColor = acc / total;
}
