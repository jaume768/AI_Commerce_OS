/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai-commerce-os/shared'],
  output: 'standalone',
};

module.exports = nextConfig;
