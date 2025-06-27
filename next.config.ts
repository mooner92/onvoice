import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: [
      'lh3.googleusercontent.com',
      // 필요하다면 다른 외부 도메인도 추가
    ],
  },
  /* config options here */
};

export default nextConfig;
