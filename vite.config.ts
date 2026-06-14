import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// The app is served under the /blur-studio/ subpath of rainn.works (proxied
// by the apex Vercel site). Production builds use an absolute /blur-studio/
// base and nest their output under dist/blur-studio/, so whatever serves the
// output at its root exposes /blur-studio/* directly — and asset URLs resolve
// correctly no matter the trailing slash. Dev stays at the root for convenience.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/blur-studio/' : '/',
  build: {
    outDir: 'dist/blur-studio',
    emptyOutDir: true,
  },
  plugins: [react()],
}));
