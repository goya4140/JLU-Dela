import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
export default defineConfig({
  envDir: false,
  build: {
    target: 'node24',
    outDir: 'out/web',
    lib: { entry: 'src/main/web/host.ts', formats: ['cjs'], fileName: () => 'host.cjs' },
    rolldownOptions: { external: ['electron', ...builtinModules, /^node:/] },
  },
});
