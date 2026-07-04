import { defineConfig } from 'tsup';

// The Cookie Munch SDK is BUNDLED into the output (it is a build-time devDependency,
// installed from the sibling Cookie-Munch/sdk repo), so the published package's only
// real runtime dependencies are the MCP SDK and zod. There is no @cookiemunch/core
// dependency: the banner flow engine runs server-side behind the Developer API, which
// the SDK reaches over HTTP.
export default defineConfig({
  entry: { index: 'src/index.ts', bin: 'src/bin.ts' },
  format: ['esm', 'cjs'],
  dts: { entry: 'src/index.ts' },
  clean: true,
  sourcemap: true,
  external: ['@modelcontextprotocol/sdk', 'zod'],
  noExternal: ['@cookiemunch/sdk'],
});
