/**
 * Cookie consent, entirely client side.
 *
 * It has to be: the public HTML must stay cacheable, and a response that varies by cookie —
 * or carries Set-Cookie — is silently not cached by Workers. So the server always sends the
 * same page and this decides, in the browser, whether the trackers ever load.
 *
 * Vanilla on purpose. This is the first public JavaScript in the project and it loads on
 * every page, so the budget is a couple of kilobytes, not a framework.
 */
import {
  consentCovers,
  consentModeSignals,
  neededCategories,
  parseConsent,
  type ConsentState,
} from "@lib/consent";
import type { AnalyticsIds } from "@lib/analytics";

const STORAGE_KEY = "sastre_consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: Record<string, unknown>;
    hj?: (...args: unknown[]) => void;
    sastreConsent?: { open: () => void };
  }
}

function read(): ConsentState | null {
  try {
    return parseConsent(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private mode, or site data blocked. Treated as "not asked", which errs towards
    // loading nothing.
    return null;
  }
}

function write(state: ConsentState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The decision still applies to this page view even if it cannot be remembered.
  }
}

/** Tells Consent Mode about a decision. Safe before GTM exists: it queues on dataLayer. */
function signal(state: ConsentState) {
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => window.dataLayer!.push(args);
  gtag("consent", "update", consentModeSignals(state));
}

function loadScript(src: string) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

/* ------------------------------------------------------------ los trackers */

function loadGtm(id: string) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`);
}

function loadGa4(id: string) {
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => window.dataLayer!.push(args);
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  gtag("js", new Date());
  gtag("config", id);
}

function loadMetaPixel(id: string) {
  const queue: unknown[] = [];
  const fbq = ((...args: unknown[]) => {
    const f = window.fbq as unknown as { callMethod?: (...a: unknown[]) => void };
    f?.callMethod ? f.callMethod(...args) : queue.push(args);
  }) as Window["fbq"];
  window.fbq = fbq;
  (window.fbq as unknown as Record<string, unknown>).queue = queue;
  (window.fbq as unknown as Record<string, unknown>).version = "2.0";
  loadScript("https://connect.facebook.net/en_US/fbevents.js");
  fbq!("init", id);
  fbq!("track", "PageView");
}

function loadTiktok(id: string) {
  const methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
  const ttq: Record<string, unknown> = (window.ttq = window.ttq || {});
  const queue: unknown[] = ((ttq._q as unknown[]) = (ttq._q as unknown[]) || []);
  for (const method of methods) {
    ttq[method] = (...args: unknown[]) => queue.push([method, ...args]);
  }
  loadScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`);
  (ttq.page as () => void)();
}

function loadHotjar(id: string) {
  const hj = ((...args: unknown[]) => {
    const q = ((window.hj as unknown as { q?: unknown[] }).q ??= []);
    q.push(args);
  }) as Window["hj"];
  window.hj = window.hj || hj;
  (window as unknown as Record<string, unknown>)._hjSettings = { hjid: Number(id), hjsv: 6 };
  loadScript(`https://static.hotjar.com/c/hotjar-${encodeURIComponent(id)}.js?sv=6`);
}

const LOADERS: Partial<Record<keyof AnalyticsIds, (id: string) => void>> = {
  gtm: loadGtm,
  ga4: loadGa4,
  metaPixel: loadMetaPixel,
  tiktokPixel: loadTiktok,
  hotjar: loadHotjar,
};

const CATEGORY_OF: Partial<Record<keyof AnalyticsIds, "analitica" | "marketing">> = {
  gtm: "analitica",
  ga4: "analitica",
  hotjar: "analitica",
  metaPixel: "marketing",
  tiktokPixel: "marketing",
};

/** Loaded once per page even if consent is granted twice. */
const loaded = new Set<string>();

function applyConsent(state: ConsentState, ids: AnalyticsIds) {
  signal(state);

  for (const [key, loader] of Object.entries(LOADERS) as [keyof AnalyticsIds, (id: string) => void][]) {
    const id = ids[key];
    if (!id || loaded.has(key)) continue;

    const category = CATEGORY_OF[key];
    if (!category || !state[category]) continue;

    // GTM supersedes a standalone GA4: loading both double-counts every page view.
    if (key === "ga4" && ids.gtm) continue;

    loaded.add(key);
    try {
      loader(id);
    } catch {
      // A broken tracker must not take the page down with it.
    }
  }
}

/* ------------------------------------------------------------------ la UI */

function init() {
  const config = document.getElementById("consent-config");
  if (!config?.textContent) return;

  let ids: AnalyticsIds;
  try {
    ids = JSON.parse(config.textContent) as AnalyticsIds;
  } catch {
    return;
  }

  const categories = neededCategories(ids);
  if (categories.length === 0) return;

  const banner = document.getElementById("consent-banner");
  const details = document.getElementById("consent-details");

  const show = () => banner?.removeAttribute("hidden");
  const hide = () => banner?.setAttribute("hidden", "");

  const decide = (state: ConsentState) => {
    write(state);
    applyConsent(state, ids);
    hide();
  };

  const stored = read();
  if (consentCovers(stored, ids)) {
    applyConsent(stored!, ids);
  } else {
    // Denied by default, and announced as such, so Consent Mode knows before anything runs.
    signal({ analitica: false, marketing: false });
    show();
  }

  document.getElementById("consent-accept")?.addEventListener("click", () => {
    decide(Object.fromEntries(categories.map((c) => [c, true])));
  });

  document.getElementById("consent-reject")?.addEventListener("click", () => {
    decide(Object.fromEntries(categories.map((c) => [c, false])));
  });

  document.getElementById("consent-configure")?.addEventListener("click", () => {
    details?.toggleAttribute("hidden");
  });

  document.getElementById("consent-save")?.addEventListener("click", () => {
    decide(
      Object.fromEntries(
        categories.map((c) => [
          c,
          !!document.querySelector<HTMLInputElement>(`#consent-${c}`)?.checked,
        ])
      )
    );
  });

  // So the footer's «Preferencias de cookies» link can reopen it. Withdrawing consent has to
  // be as easy as giving it.
  window.sastreConsent = {
    open: () => {
      const current = read();
      for (const category of categories) {
        const input = document.querySelector<HTMLInputElement>(`#consent-${category}`);
        if (input) input.checked = !!current?.[category];
      }
      details?.removeAttribute("hidden");
      show();
    },
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
