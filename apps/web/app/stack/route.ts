import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const html = await readFile(join(process.cwd(), "public", "stack", "index.html"), "utf8");

  return new Response(html, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}
