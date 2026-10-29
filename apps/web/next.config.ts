import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/shared/i18n/request.ts');

/** mock — встроенный контрактный мок-бэкенд (демо без инфраструктуры); live — проксирование в API Gateway. */
const apiMode = process.env.API_MODE ?? 'mock';
const gatewayUrl = process.env.GATEWAY_URL ?? 'http://localhost:8080';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const config: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  experimental: {
    optimizePackageImports: ['radix-ui', 'motion'],
    // Персистентный кэш Turbopack в dev занимает гигабайты — в CI и на слабых дисках отключаем
    turbopackFileSystemCacheForDev: process.env.NEXT_DEV_FS_CACHE === 'true',
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
  async rewrites() {
    return apiMode === 'live' ? { beforeFiles: [{ source: '/api/v1/:path*', destination: `${gatewayUrl}/v1/:path*` }], afterFiles: [], fallback: [] } : [];
  },
};

export default withNextIntl(config);
