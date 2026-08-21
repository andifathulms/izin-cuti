/** @type {import('next').NextConfig} */

// basePath must match the repository name for GitHub Pages. Override with
// BASE_PATH when the repository is renamed or served from a custom domain.
const basePath = process.env.BASE_PATH ?? '/izin-cuti'

const nextConfig = {
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? basePath : '',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
}

module.exports = nextConfig
