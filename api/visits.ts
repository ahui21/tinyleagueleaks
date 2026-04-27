import { Redis } from "@upstash/redis";

export const config = { runtime: "edge" };

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token:
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const KEY = "visits";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const expected = process.env.LOG_VIEW_KEY;

  if (!expected) {
    return new Response(
      "LOG_VIEW_KEY env var not set — set it in the Vercel project to enable this endpoint.",
      { status: 500 },
    );
  }
  if (url.searchParams.get("key") !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? 200) || 200,
    1000,
  );
  const format = url.searchParams.get("format") ?? "html";

  const raw = await redis.lrange<string | object>(KEY, 0, limit - 1);
  const entries = raw.map((e: any) => (typeof e === "string" ? JSON.parse(e) : e));

  if (format === "json") {
    return new Response(JSON.stringify(entries, null, 2), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = entries
    .map((e: any) => {
      const geo = [e.geo?.city, e.geo?.region, e.geo?.country]
        .filter(Boolean)
        .join(", ");
      return `<tr>
        <td class="t">${escapeHtml(e.ts ?? "")}</td>
        <td>${escapeHtml(e.ip ?? "")}</td>
        <td>${escapeHtml(geo)}</td>
        <td>${escapeHtml(e.geo?.timezone ?? "")}</td>
        <td class="ua">${escapeHtml(e.ua ?? "")}</td>
        <td>${escapeHtml(e.ref ?? "")}</td>
        <td>${escapeHtml(e.query ?? "")}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>tinyleagueleaks · visits</title>
<style>
  body { font: 13px/1.4 ui-monospace, "DM Mono", Consolas, monospace; background: #f4ecd8; color: #1a1614; margin: 0; padding: 24px; }
  h1 { font-family: "Playfair Display", Georgia, serif; font-style: italic; font-weight: 900; margin: 0 0 8px; font-size: 32px; }
  .meta { opacity: 0.7; margin-bottom: 20px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; background: #fffaf0; border: 2px solid #1a1614; }
  th, td { padding: 6px 8px; border-bottom: 1px dotted rgba(26,22,20,0.3); vertical-align: top; }
  th { background: #e8dcc0; text-align: left; text-transform: uppercase; letter-spacing: 0.15em; font-size: 10px; border-bottom: 2px solid #1a1614; }
  td.t { white-space: nowrap; }
  td.ua { max-width: 300px; word-break: break-word; opacity: 0.8; }
  tr:hover { background: rgba(0,0,0,0.04); }
</style>
</head>
<body>
<h1>Tiny League Leaks · Visits</h1>
<div class="meta">${entries.length} entries · most recent first</div>
<table>
  <thead><tr>
    <th>Time (UTC)</th><th>IP</th><th>Location</th><th>Timezone</th><th>User-Agent</th><th>Referer</th><th>Query</th>
  </tr></thead>
  <tbody>${rows || `<tr><td colspan="7" style="opacity:0.6;padding:24px">No visits yet.</td></tr>`}</tbody>
</table>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
