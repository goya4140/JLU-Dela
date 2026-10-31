import { cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer/web',
  base: './',
  envDir: false,
  resolve: { alias: { '@': resolve('src/renderer') } },
  define: {
    'import.meta.env.VITE_DELA_DEMO': JSON.stringify('true'),
    __PDF_ASSET_DIR__: JSON.stringify(''),
    __FILE_ICONS_DIR__: JSON.stringify(''),
  },
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'public-demo-assets',
      async closeBundle() {
        await cp('assets/onboarding-video.webm', '.build/pages/demo-video.webm');
        await cp('LICENSE', '.build/pages/LICENSE.txt');
        await writeFile('.build/pages/.nojekyll', '');
      },
    },
  ],
  build: { target: 'es2022', outDir: '../../../.build/pages', emptyOutDir: true },
});
