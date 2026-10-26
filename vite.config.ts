import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { releaseProfile } from './shared/release.ts';
const profile = releaseProfile(process.env.STELUX_RELEASE_PROFILE);
const focused = profile !== 'full';
export default defineConfig({
  plugins: [react(), ...(focused ? [{ name: 'workspace-html', transformIndexHtml: (html: string) => html.replace('Blitzkrieg — Operations workspace', 'Blitzkrieg — Welding workspace').replace('Blitzkrieg connects your projects, materials, welding, and equipment in one operations workspace.', 'Blitzkrieg connects projects, isometrics, welds, and inspection records in one welding workspace.') }] : [])],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { outDir: profile === 'access-prototype' ? 'dist-access-prototype' : focused ? 'dist-welding-demo' : 'dist', sourcemap: !focused, rollupOptions: { output: { manualChunks: { 'react-vendor': ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'] } } } }
});
