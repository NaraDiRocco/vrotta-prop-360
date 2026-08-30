import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // @r360/core se publica como TypeScript fuente (main apunta a src/index.ts).
  transpilePackages: ['@r360/core'],
  typescript: { ignoreBuildErrors: false },
};

export default config;
