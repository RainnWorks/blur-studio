#version 300 es

// Base pass: draws the photo (or a checkerboard before one is loaded).

precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_dpr; // device px per image px
uniform sampler2D u_image;
uniform int u_imageReady;

float chessboard(vec2 uv, float size) {
  float yBars = step(size * 2.0, mod(uv.y * 2.0, size * 4.0));
  float xBars = step(size * 2.0, mod(uv.x * 2.0, size * 4.0));
  return abs(yBars - xBars);
}

void main() {
  vec3 color;
  if (u_imageReady == 1) {
    // image rows are top-down; GL uv is bottom-up
    color = texture(u_image, vec2(v_uv.x, 1.0 - v_uv.y)).rgb;
  } else {
    color = vec3(1.0 - chessboard(gl_FragCoord.xy / max(u_dpr, 1e-6), 20.0) / 4.0);
  }
  fragColor = vec4(color, 1.0);
}
