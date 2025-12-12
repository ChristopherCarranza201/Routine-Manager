// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  // En prod no generes source maps de navegador
  productionBrowserSourceMaps: false,
};

export default nextConfig;
