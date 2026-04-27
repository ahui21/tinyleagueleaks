import { Redis } from "@upstash/redis";

export const config = { runtime: "edge" };

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token:
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const KEY = "visits";
const MAX_ENTRIES = 5000;

interface Geo {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  lat?: string;
  lon?: string;
  asn?: string;
}

interface Entry {
  ts: string;
  ip: string;
  geo: Geo;
  ua: string;
  ref: string;
  lang: string;
  query: string;
  path: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const url = new URL(req.url);
  const h = req.headers;

  const ipHeader = h.get("x-forwarded-for") ?? "";
  const ip = ipHeader.split(",")[0]?.trim() || "—";

  const entry: Entry = {
    ts: new Date().toISOString(),
    ip,
    geo: {
      country: h.get("x-vercel-ip-country") ?? undefined,
      region: h.get("x-vercel-ip-country-region") ?? undefined,
      city: decodeURIComponent(h.get("x-vercel-ip-city") ?? "") || undefined,
      timezone: h.get("x-vercel-ip-timezone") ?? undefined,
      lat: h.get("x-vercel-ip-latitude") ?? undefined,
      lon: h.get("x-vercel-ip-longitude") ?? undefined,
      asn: h.get("x-vercel-ip-as-number") ?? undefined,
    },
    ua: h.get("user-agent") ?? "",
    ref: h.get("referer") ?? "",
    lang: h.get("accept-language") ?? "",
    query: url.search,
    path: url.searchParams.get("path") ?? "/",
  };

  try {
    await redis.lpush(KEY, JSON.stringify(entry));
    await redis.ltrim(KEY, 0, MAX_ENTRIES - 1);
  } catch (err) {
    return new Response(`log_failed: ${(err as Error).message}`, {
      status: 500,
    });
  }

  return new Response(null, { status: 204 });
}
