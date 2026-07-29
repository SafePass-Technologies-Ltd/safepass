import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile the shared package so workspace imports work.
  transpilePackages: ['@safepass/shared'],
  images: {
    // branding.md Section 8's Delivery & Performance Guardrails: AVIF/WebP with
    // responsive breakpoints at 480/768/1200/1920. The initial payload budget
    // is under 1.5MB to hold up on the variable Nigerian mobile networks the
    // core product already designs around.
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [480, 768, 1200, 1920],
  },
  allowedDevOrigins: ['192.168.0.111']
};

export default nextConfig;
