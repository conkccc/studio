import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
  //allowedDevOrigins: ['127.0.0.1', 'localhost'],
  typescript: {
    // 빌드 시 타입스크립트 오류를 무시하지 않도록 설정 (기본값)
  },
  eslint: {
    // 빌드 시 ESLint 오류를 무시하지 않도록 설정 (기본값)
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
