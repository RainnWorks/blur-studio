import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  // relative base so the build works both at the domain root and when served
  // from a project subpath (e.g. GitHub Pages at /blur-studio/)
  base: './',
  plugins: [react()],
});
