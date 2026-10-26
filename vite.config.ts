import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    assetsInlineLimit: 100_000_000,
  },
});
