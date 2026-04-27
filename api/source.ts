import { Redis } from "@upstash/redis";

export const config = { runtime: "edge" };

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token:
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Keep the sheet URL hardcoded server-side so the destination is authoritative
// and not influenced by client query params.
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/12EnTwgG6owH2ltR8e19vAlzPvmaWtC3N7KZvHdpH0cw/edit?usp=sharing";

const EVENTS_KEY = "events";
const SOURCE_KEY = "source_clicks";
const MAX_EVENTS = 50000;
const MAX_SOURCE = 5000;

function dumpHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const h = req.headers;
  const ipHeader = h.get("x-forwarded-for") ?? "";
  const ip = ipHeader.split(",")[0]?.trim() || "—";
  const vid = url.searchParams.get("vid") ?? "";

  const entry = {
    kind: "event" as const,
    ts: new Date().toISOString(),
    ip,
    geo: {
      country: h.get("x-vercel-ip-country") ?? undefined,
      countryRegion: h.get("x-vercel-ip-country-region") ?? undefined,
      city: decodeURIComponent(h.get("x-vercel-ip-city") ?? "") || undefined,
      timezone: h.get("x-vercel-ip-timezone") ?? undefined,
      lat: h.get("x-vercel-ip-latitude") ?? undefined,
      lon: h.get("x-vercel-ip-longitude") ?? undefined,
      asn: h.get("x-vercel-ip-as-number") ?? undefined,
      postalCode: h.get("x-vercel-ip-postal-code") ?? undefined,
      continent: h.get("x-vercel-ip-continent") ?? undefined,
    },
    server: {
      ua: h.get("user-agent") ?? "",
      ref: h.get("referer") ?? "",
      lang: h.get("accept-language") ?? "",
      query: url.search,
      headers: dumpHeaders(req),
    },
    client: {
      vid,
      event: "source_click",
      payload: { ts: new Date().toISOString() },
    },
  };

  try {
    await Promise.all([
      redis.lpush(EVENTS_KEY, JSON.stringify(entry)),
      redis.lpush(SOURCE_KEY, JSON.stringify(entry)),
    ]);
    await Promise.all([
      redis.ltrim(EVENTS_KEY, 0, MAX_EVENTS - 1),
      redis.ltrim(SOURCE_KEY, 0, MAX_SOURCE - 1),
    ]);
  } catch {
    // Don't block the redirect on log failure.
  }

  return Response.redirect(SHEET_URL, 302);
}
