// Client-side data collection. Builds a JSON object that's POSTed to /api/log
// alongside the headers the edge function captures.
//
// Sticky visitor ID is stored in localStorage so repeat visits link together.

const VID_KEY = "tll.vid";
const FIRST_KEY = "tll.firstSeen";
const VISIT_COUNT_KEY = "tll.visits";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return (
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })
  );
}

export function getVisitorId(): {
  vid: string;
  firstSeen: string;
  visitCount: number;
} {
  if (typeof window === "undefined") {
    return { vid: "ssr", firstSeen: "", visitCount: 0 };
  }
  let vid: string;
  try {
    vid = localStorage.getItem(VID_KEY) ?? "";
    if (!vid) {
      vid = uuid();
      localStorage.setItem(VID_KEY, vid);
      localStorage.setItem(FIRST_KEY, new Date().toISOString());
    }
  } catch {
    vid = uuid();
  }
  const firstSeen = (() => {
    try {
      return localStorage.getItem(FIRST_KEY) ?? new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  })();
  const visitCount = (() => {
    try {
      const n = (Number(localStorage.getItem(VISIT_COUNT_KEY)) || 0) + 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(n));
      return n;
    } catch {
      return 1;
    }
  })();
  return { vid, firstSeen, visitCount };
}

function safeWebGL(): { vendor?: string; renderer?: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return {};
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) {
      return {
        vendor: gl.getParameter(gl.VENDOR) as string,
        renderer: gl.getParameter(gl.RENDERER) as string,
      };
    }
    return {
      vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string,
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string,
    };
  } catch {
    return {};
  }
}

async function highEntropyUA(): Promise<Record<string, unknown> | undefined> {
  const ua = (navigator as any).userAgentData;
  if (!ua?.getHighEntropyValues) return undefined;
  try {
    return await ua.getHighEntropyValues([
      "architecture",
      "bitness",
      "model",
      "platformVersion",
      "uaFullVersion",
      "fullVersionList",
      "wow64",
    ]);
  } catch {
    return undefined;
  }
}

export interface ClientFingerprint {
  vid: string;
  firstSeen: string;
  visitCount: number;
  ts: string;
  url: string;
  referrer: string;
  screen: {
    w: number;
    h: number;
    aw: number;
    ah: number;
    vw: number;
    vh: number;
    dpr: number;
    depth: number;
    colorDepth: number;
    orientation?: string;
  };
  tz: string;
  tzOffsetMin: number;
  langs: readonly string[];
  primaryLang: string;
  platform: string;
  ua: string;
  uaData?: Record<string, unknown>;
  hardware: {
    cpu?: number;
    mem?: number;
    touch?: number;
  };
  webgl: { vendor?: string; renderer?: string };
  connection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
  cookieEnabled: boolean;
  doNotTrack: string | null;
  pdf: boolean;
  storage: {
    local: boolean;
    session: boolean;
    indexedDB: boolean;
  };
  permissions?: Record<string, string>;
  performance?: {
    nav?: string;
    domLoaded?: number;
    fetchStart?: number;
  };
}

export async function buildFingerprint(): Promise<ClientFingerprint> {
  const visitor = getVisitorId();
  const conn = (navigator as any).connection;
  const orientation =
    typeof screen !== "undefined" && (screen as any).orientation
      ? (screen as any).orientation.type
      : undefined;

  const uaData = await highEntropyUA();

  // Permissions probe — quick, non-prompting checks.
  const permissions: Record<string, string> = {};
  if (navigator.permissions?.query) {
    const names = ["geolocation", "notifications", "camera", "microphone"];
    await Promise.all(
      names.map(async (n) => {
        try {
          const res = await navigator.permissions.query({
            name: n as PermissionName,
          });
          permissions[n] = res.state;
        } catch {
          // ignore
        }
      }),
    );
  }

  let perfNav: string | undefined;
  let domLoaded: number | undefined;
  let fetchStart: number | undefined;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) {
      perfNav = nav.type;
      domLoaded = Math.round(nav.domContentLoadedEventEnd);
      fetchStart = Math.round(nav.fetchStart);
    }
  } catch {
    // ignore
  }

  let storageOk = { local: false, session: false, indexedDB: false };
  try {
    storageOk.local = !!window.localStorage;
  } catch {}
  try {
    storageOk.session = !!window.sessionStorage;
  } catch {}
  try {
    storageOk.indexedDB = !!window.indexedDB;
  } catch {}

  return {
    ...visitor,
    ts: new Date().toISOString(),
    url: window.location.href,
    referrer: document.referrer || "",
    screen: {
      w: screen.width,
      h: screen.height,
      aw: screen.availWidth,
      ah: screen.availHeight,
      vw: window.innerWidth,
      vh: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      depth: screen.pixelDepth,
      colorDepth: screen.colorDepth,
      orientation,
    },
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tzOffsetMin: -new Date().getTimezoneOffset(),
    langs: navigator.languages ?? [navigator.language],
    primaryLang: navigator.language,
    platform: navigator.platform,
    ua: navigator.userAgent,
    uaData,
    hardware: {
      cpu: navigator.hardwareConcurrency,
      mem: (navigator as any).deviceMemory,
      touch: navigator.maxTouchPoints,
    },
    webgl: safeWebGL(),
    connection: conn
      ? {
          type: conn.type,
          effectiveType: conn.effectiveType,
          downlink: conn.downlink,
          rtt: conn.rtt,
          saveData: conn.saveData,
        }
      : undefined,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    pdf: !!(navigator as any).pdfViewerEnabled,
    storage: storageOk,
    permissions: Object.keys(permissions).length ? permissions : undefined,
    performance: {
      nav: perfNav,
      domLoaded,
      fetchStart,
    },
  };
}

export function postLog(body: unknown, path = "/api/log"): void {
  try {
    const json = JSON.stringify(body);
    if (navigator.sendBeacon) {
      const blob = new Blob([json], { type: "application/json" });
      navigator.sendBeacon(path, blob);
      return;
    }
  } catch {
    // fall through
  }
  fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}
