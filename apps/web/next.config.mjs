/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  async rewrites() {
    const apiProxyTarget =
      process.env.LOCAL_API_PROXY_TARGET ??
      process.env.PUBLIC_API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:4000/api/v1";
    if (!apiProxyTarget) return [];

    return [
      {
        source: "/stack",
        destination: "/stack/index.html"
      },
      {
        source: "/stack/",
        destination: "/stack/index.html"
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/:path*`
      },
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
