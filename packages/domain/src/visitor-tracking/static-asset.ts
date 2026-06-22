const STATIC_PATHS = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml"]);

const STATIC_PREFIXES = ["/_next/"];

const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|map)$/i;

/** Skip telemetry for static assets and framework internals. */
export function isStaticAsset(path: string): boolean {
  const normalized = normalizePath(path);
  if (STATIC_PATHS.has(normalized)) return true;
  if (STATIC_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  if (STATIC_EXTENSIONS.test(normalized)) return true;
  return false;
}

function normalizePath(path: string): string {
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? path;
  if (!withoutQuery) return "/";
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}