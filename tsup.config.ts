import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', bin: 'src/bin.ts' },
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: ['@modelcontextprotocol/sdk', 'zod', '@cookiemunch/sdk'],
});
