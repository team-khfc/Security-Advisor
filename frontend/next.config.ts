import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['securityadvisor.localhost'],
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/swagger-ui.html',
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:8080'}/swagger-ui.html`,
      },
      {
        source: '/swagger-ui/:path*',
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:8080'}/swagger-ui/:path*`,
      },
      {
        source: '/v3/api-docs/:path*',
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:8080'}/v3/api-docs/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${process.env.API_ORIGIN ?? 'http://localhost:8080'}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
