/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.heygen.com' },
      { protocol: 'https', hostname: '**.heygen.ai' },
      { protocol: 'https', hostname: 'resource.heygen.com' },
    ],
  },
};

module.exports = nextConfig;
