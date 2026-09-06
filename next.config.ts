import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Type errors block the build. Same policy as Payload Terminal V0.
  typescript: { ignoreBuildErrors: false },
  // Local runtime stores, host-specific Rust builds, and the repository's own
  // documentation and test output are never deployment assets. Without the
  // documentation exclusions the /earth trace carried 15.4 MB of docs and
  // screenshots that no page reads at runtime.
  outputFileTracingExcludes: {
    '/*': [
      './.payload/**/*', './.stamp/**/*', './.git/**/*', './.env*',
      './native/state-kernel/target/**/*', './next.config.ts',
      './docs/**/*', './test-results/**/*', './playwright-report/**/*', './README.md',
      // Test and tooling source rode in all 17 route traces: 189 non-runtime files,
      // 2.3 MB per trace. scripts/ and examples/ are deliberately NOT excluded:
      // src/gat/runtime.ts spawns scripts/gat-audit-runner.py, and
      // src/adapter/productionSource.ts reads examples/ during the /candidates render.
      './**/*.test.ts', './**/*.test.tsx', './**/*.spec.ts',
      './tests/**/*', './clients/**/*', './tsconfig.tsbuildinfo', './package-lock.json',
    ],
  },
  // The /candidates server render reads these committed bytes and recomputes their
  // digests; tracing did not reach them through the dynamic import, so a deployed
  // build had none of them. .stamp/production-worker.mjs stays excluded on purpose:
  // src/production/worker.ts spawns it, but it is operator-built, not deployed.
  outputFileTracingIncludes: {
    '/candidates': [
      './examples/carrier/acquisition.json', './examples/carrier/source.json',
      './examples/carrier/normalization.json', './examples/evidence/request.json',
      './examples/evidence/notice.txt',
    ],
  },
  // CesiumJS's KML support imports a zip.js subpath its package exports map does not expose to Turbopack.
  // The Earth Twin never reads KML; resolve the subpath to the package's main entry so the engine bundles.
  turbopack: { resolveAlias: { '@zip.js/zip.js/lib/zip-no-worker.js': '@zip.js/zip.js' } },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
