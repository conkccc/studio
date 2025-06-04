import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
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
