import { defineConfig } from '@internal/tsdown-config';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  dts: true,
  minify: false,
  clean: true,
  platform: 'node',
});
