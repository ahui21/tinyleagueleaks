import { Redis } from "@upstash/redis";

export const config = { runtime: "edge" };

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token:
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const VISITS_KEY = "visits";
const EVENTS_KEY = "events";
const MAX_VISITS = 10000;
const MAX_EVENTS = 50000;

function dumpHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const url = new URL(req.url);
  const h = req.headers;

  const ipHeader = h.get("x-forwarded-for") ?? "";
  const ip = ipHeader.split(",")[0]?.trim() || "—";

  let body: any = null;
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = null;
  }

  const kind: "visit" | "event" =
    body?.kind === "event" ? "event" : "visit";

  const entry = {
    kind,
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
      acceptEncoding: h.get("accept-encoding") ?? "",
      secChUa: h.get("sec-ch-ua") ?? "",
      secChUaPlatform: h.get("sec-ch-ua-platform") ?? "",
      secChUaMobile: h.get("sec-ch-ua-mobile") ?? "",
      secFetchSite: h.get("sec-fetch-site") ?? "",
      dnt: h.get("dnt") ?? "",
      query: url.search,
      headers: dumpHeaders(req),
    },
    client: body ?? null,
  };

  const targetKey = kind === "event" ? EVENTS_KEY : VISITS_KEY;
  const cap = kind === "event" ? MAX_EVENTS : MAX_VISITS;

  try {
    await redis.lpush(targetKey, JSON.stringify(entry));
    await redis.ltrim(targetKey, 0, cap - 1);
  } catch (err) {
    return new Response(`log_failed: ${(err as Error).message}`, {
      status: 500,
    });
  }

  return new Response(null, { status: 204 });
}
