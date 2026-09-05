import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Operator evidence, ignored dependency checkouts and the served engine build are not this repository's source.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**', '.stamp/**', '.payload/**', 'src/vendor/**', 'public/cesium/**']),
]);

export default eslintConfig;
