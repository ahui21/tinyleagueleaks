import { Redis } from "@upstash/redis";

export const config = { runtime: "edge" };

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token:
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtTs(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

function geoLine(e: any): string {
  const parts = [e.geo?.city, e.geo?.countryRegion, e.geo?.country]
    .filter(Boolean)
    .join(", ");
  const extra = [e.geo?.postalCode, e.geo?.timezone, e.geo?.asn]
    .filter(Boolean)
    .join(" · ");
  const ll = e.geo?.lat && e.geo?.lon ? `${e.geo.lat},${e.geo.lon}` : "";
  return [parts, extra, ll].filter(Boolean).join(" / ");
}

function deviceLine(e: any): string {
  const c = e.client ?? {};
  const s = c.screen ?? {};
  const hw = c.hardware ?? {};
  const w = s.w && s.h ? `${s.w}×${s.h}` : "";
  const v = s.vw && s.vh ? `vp ${s.vw}×${s.vh}` : "";
  const d = s.dpr ? `@${s.dpr}x` : "";
  const cpu = hw.cpu ? `${hw.cpu} cores` : "";
  const mem = hw.mem ? `${hw.mem}GB` : "";
  const touch = hw.touch ? `touch:${hw.touch}` : "";
  return [w, v, d, cpu, mem, touch].filter(Boolean).join(" · ");
}

function gpuLine(e: any): string {
  const g = e.client?.webgl ?? {};
  return [g.vendor, g.renderer].filter(Boolean).join(" / ");
}

function netLine(e: any): string {
  const c = e.client?.connection;
  if (!c) return "";
  return [
    c.effectiveType,
    c.downlink ? `${c.downlink}Mb/s` : "",
    c.rtt ? `${c.rtt}ms` : "",
    c.saveData ? "saveData" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function uaModel(e: any): string {
  const ua = e.client?.uaData;
  if (!ua) return "";
  const parts: string[] = [];
  if (ua.model) parts.push(String(ua.model));
  if (ua.platformVersion) parts.push(`v${ua.platformVersion}`);
  if (ua.architecture) parts.push(String(ua.architecture));
  return parts.join(" ");
}

function shortUA(s: string): string {
  if (!s) return "";
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const expected = process.env.LOG_VIEW_KEY;
  if (!expected) {
    return new Response(
      "LOG_VIEW_KEY env var not set — set it in Vercel project settings.",
      { status: 500 },
    );
  }
  if (url.searchParams.get("key") !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  const tab = url.searchParams.get("tab") === "events" ? "events" : "visits";
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? 200) || 200,
    2000,
  );
  const format = url.searchParams.get("format") ?? "html";
  const targetKey = tab === "events" ? "events" : "visits";

  const raw = await redis.lrange<string | object>(targetKey, 0, limit - 1);
  const entries = raw.map((e: any) =>
    typeof e === "string" ? JSON.parse(e) : e,
  );

  if (format === "json") {
    return new Response(JSON.stringify(entries, null, 2), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const byVid = new Map<string, any[]>();
  if (tab === "visits") {
    for (const e of entries) {
      const vid = e.client?.vid ?? "—";
      if (!byVid.has(vid)) byVid.set(vid, []);
      byVid.get(vid)!.push(e);
    }
  }

  const visitorRows = Array.from(byVid.entries())
    .sort((a, b) => b[1][0].ts.localeCompare(a[1][0].ts))
    .map(([vid, list]) => {
      const latest = list[0];
      const c = latest.client ?? {};
      const lastQuery = latest.server?.query ?? "";
      const ips = Array.from(new Set(list.map((e) => e.ip).filter(Boolean)));
      const cities = Array.from(
        new Set(list.map((e) => geoLine(e)).filter(Boolean)),
      );
      return `
        <tr class="vid-row">
          <td class="t mono">${escapeHtml(fmtTs(latest.ts))}</td>
          <td class="mono">${escapeHtml(vid.slice(0, 8))}…</td>
          <td>${escapeHtml(c.visitCount ?? "")}</td>
          <td class="mono">${escapeHtml(ips.join(", "))}</td>
          <td>${cities.map((c) => escapeHtml(c)).join("<br>")}</td>
          <td>${escapeHtml(c.tz ?? "")}<br><span class="dim">${escapeHtml(c.primaryLang ?? "")}</span></td>
          <td>${escapeHtml(deviceLine(latest))}<br><span class="dim">${escapeHtml(uaModel(latest))}</span></td>
          <td class="dim">${escapeHtml(gpuLine(latest))}</td>
          <td class="dim">${escapeHtml(netLine(latest))}</td>
          <td class="mono ua">${escapeHtml(shortUA(latest.server?.ua ?? c.ua ?? ""))}</td>
          <td class="mono">${escapeHtml(latest.server?.ref ?? c.referrer ?? "")}</td>
          <td class="mono">${escapeHtml(lastQuery)}</td>
          <td>${list.length}</td>
        </tr>
      `;
    })
    .join("");

  const eventRows = entries
    .map((e: any) => {
      const c = e.client ?? {};
      return `
        <tr>
          <td class="t mono">${escapeHtml(fmtTs(e.ts))}</td>
          <td class="mono">${escapeHtml((c.vid ?? "").slice(0, 8))}…</td>
          <td>${escapeHtml(c.event ?? "")}</td>
          <td class="mono">${escapeHtml(JSON.stringify(c.payload ?? {}))}</td>
          <td>${escapeHtml(geoLine(e))}</td>
          <td class="mono">${escapeHtml(e.ip ?? "")}</td>
        </tr>
      `;
    })
    .join("");

  const css = `
    body { font: 12px/1.4 ui-monospace, "DM Mono", Consolas, monospace; background: #f4ecd8; color: #1a1614; margin: 0; padding: 24px; }
    h1 { font-family: "Playfair Display", Georgia, serif; font-style: italic; font-weight: 900; margin: 0 0 4px; font-size: 28px; }
    .meta { opacity: 0.7; margin-bottom: 16px; font-size: 11px; }
    .tabs { margin: 16px 0; display: flex; gap: 12px; }
    .tabs a { color: #1a1614; text-decoration: none; padding: 6px 12px; border: 1px solid #1a1614; text-transform: uppercase; letter-spacing: 0.15em; font-size: 11px; }
    .tabs a.active { background: #1a1614; color: #f4ecd8; }
    table { width: 100%; border-collapse: collapse; background: #fffaf0; border: 2px solid #1a1614; }
    th, td { padding: 6px 8px; border-bottom: 1px dotted rgba(26,22,20,0.3); vertical-align: top; }
    th { background: #e8dcc0; text-align: left; text-transform: uppercase; letter-spacing: 0.15em; font-size: 10px; border-bottom: 2px solid #1a1614; position: sticky; top: 0; }
    td.t { white-space: nowrap; }
    td.mono { font-family: ui-monospace, monospace; }
    td.ua { max-width: 280px; word-break: break-word; }
    tr:hover { background: rgba(0,0,0,0.04); }
    .dim { opacity: 0.6; }
    .legend { margin-top: 16px; font-size: 11px; opacity: 0.7; }
  `;

  const tabLink = (id: string, label: string) => {
    const u = new URL(req.url);
    u.searchParams.set("tab", id);
    return `<a class="${tab === id ? "active" : ""}" href="${escapeHtml(u.pathname + u.search)}">${label}</a>`;
  };

  let table = "";
  if (tab === "visits") {
    table = `
      <table>
        <thead><tr>
          <th>Last seen (UTC)</th>
          <th>Visitor</th>
          <th>Visits</th>
          <th>IPs</th>
          <th>Location</th>
          <th>TZ / Lang</th>
          <th>Device</th>
          <th>GPU</th>
          <th>Net</th>
          <th>User-Agent</th>
          <th>Referer</th>
          <th>Last Query</th>
          <th>Pings</th>
        </tr></thead>
        <tbody>${visitorRows || `<tr><td colspan="13" class="dim" style="padding:24px">No visits yet.</td></tr>`}</tbody>
      </table>
      <div class="legend">
        Visitor ID is a sticky <code>localStorage</code> token per browser profile. Cleared if they wipe site data, use private browsing, or switch browsers — cross-reference with IP + GPU + screen size to merge.
      </div>
    `;
  } else {
    table = `
      <table>
        <thead><tr>
          <th>Time (UTC)</th><th>Visitor</th><th>Event</th><th>Payload</th><th>Location</th><th>IP</th>
        </tr></thead>
        <tbody>${eventRows || `<tr><td colspan="6" class="dim" style="padding:24px">No events yet.</td></tr>`}</tbody>
      </table>
    `;
  }

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>tinyleagueleaks · ${tab}</title>
<style>${css}</style>
</head>
<body>
<h1>Tiny League Leaks · Surveillance</h1>
<div class="meta">${entries.length} ${tab} entries · most recent first</div>
<div class="tabs">
  ${tabLink("visits", "Visitors")}
  ${tabLink("events", "Events")}
  <a href="?key=${encodeURIComponent(expected)}&tab=${tab}&format=json">JSON</a>
</div>
${table}
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
