/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // これらはサーバー側でのみ使う。特に pdf-parse(pdfjs)は webpack で
    // バンドルすると実行時に壊れやすいため、バンドルせず node_modules から
    // 実行時 require させる(文書取り込みルートの 500 対策)。
    serverComponentsExternalPackages: [
      'fluent-ffmpeg',
      '@ffmpeg-installer/ffmpeg',
      'unpdf',
      'mammoth',
      'xlsx',
    ],
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
