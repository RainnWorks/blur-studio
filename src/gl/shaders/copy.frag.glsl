#version 300 es

precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;

void main() {
  fragColor = vec4(texture(u_scene, v_uv).rgb, 1.0);
}
