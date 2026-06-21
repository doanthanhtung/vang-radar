/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  async rewrites() {
    const apiProxyTarget = process.env.LOCAL_API_PROXY_TARGET;
    if (!apiProxyTarget) return [];

    return [
      {
        source: "/api-preview/:path*",
        destination: `${apiProxyTarget}/:path*`
      }
    ];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };
    return config;
  }
};

export default nextConfig;
