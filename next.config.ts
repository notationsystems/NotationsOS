import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Type errors block the build. Same policy as Payload Terminal V0.
  typescript: { ignoreBuildErrors: false },
  // Local runtime stores and host-specific Rust builds are operator-managed,
  // never deployment assets inferred from dynamic local filesystem paths.
  outputFileTracingExcludes: {
    '/*': ['./.payload/**/*', './.stamp/**/*', './.git/**/*', './.env*', './native/state-kernel/target/**/*', './next.config.ts'],
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
