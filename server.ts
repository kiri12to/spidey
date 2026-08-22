import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  /**
   * Web search proxy — provider chain with fallback.
   *
   * The browser can't call search APIs directly (CORS, and any key would be
   * visible in client JS), so the server does it and keeps secrets here.
   *
   * Tries in order, falls through on failure:
   *   1. SearXNG   — self-hosted, free, unlimited. Set SEARXNG_URL.
   *   2. Google CSE — 100/day free, no card. Set GOOGLE_CSE_KEY + GOOGLE_CSE_CX.
   *   3. Brave     — paid since Feb 2026. Set BRAVE_API_KEY.
   *   4. DuckDuckGo — no key, no config, always available. Default.
   */
  interface SearchHit {
    title: string;
    url: string;
    snippet: string;
  }

  const fetchWithTimeout = async (url: string, opts: any = {}, ms = 15000) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
  };

  const decodeEntities = (str: string) =>
    str
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim();

  async function searchSearxng(q: string): Promise<SearchHit[]> {
    const base = (process.env.SEARXNG_URL || "").replace(/\/+$/, "");
    if (!base) return [];
    const url = `${base}/search?q=${encodeURIComponent(q)}&format=json&language=en`;
    const r = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`SearXNG returned ${r.status}`);
    const data: any = await r.json();
    return (data?.results || []).slice(0, 5).map((x: any) => ({
      title: x.title || "",
      url: x.url || "",
      snippet: decodeEntities(x.content || ""),
    }));
  }

  async function searchGoogleCse(q: string): Promise<SearchHit[]> {
    const key = process.env.GOOGLE_CSE_KEY;
    const cx = process.env.GOOGLE_CSE_CX;
    if (!key || !cx) return [];
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&num=5&q=${encodeURIComponent(q)}`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) throw new Error(`Google CSE returned ${r.status}`);
    const data: any = await r.json();
    return (data?.items || []).slice(0, 5).map((x: any) => ({
      title: x.title || "",
      url: x.link || "",
      snippet: decodeEntities(x.snippet || ""),
    }));
  }

  async function searchBrave(q: string): Promise<SearchHit[]> {
    const key = process.env.BRAVE_API_KEY;
    if (!key) return [];
    const url = `https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(q)}`;
    const r = await fetchWithTimeout(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
    });
    if (!r.ok) throw new Error(`Brave returned ${r.status}`);
    const data: any = await r.json();
    return (data?.web?.results || []).slice(0, 5).map((x: any) => ({
      title: x.title || "",
      url: x.url || "",
      snippet: decodeEntities(x.description || ""),
    }));
  }

  /**
   * DuckDuckGo's no-JS HTML endpoint. No key, no quota, no signup.
   * It's scraping, so the markup can shift -- that's why it's last in the
   * chain and why failures are reported honestly rather than swallowed.
   */
  async function searchDuckDuckGo(q: string): Promise<SearchHit[]> {
    const r = await fetchWithTimeout("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      body: `q=${encodeURIComponent(q)}`,
    });
    if (!r.ok) throw new Error(`DuckDuckGo returned ${r.status}`);
    const html = await r.text();

    const hits: SearchHit[] = [];
    const blockRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html)) !== null) snippets.push(decodeEntities(sm[1]));

    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = blockRe.exec(html)) !== null && hits.length < 5) {
      let href = m[1];
      // DDG wraps links: //duckduckgo.com/l/?uddg=<encoded>&rut=...
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
      if (href.startsWith("//")) href = "https:" + href;
      hits.push({
        title: decodeEntities(m[2]),
        url: href,
        snippet: snippets[i] || "",
      });
      i++;
    }
    return hits;
  }

  app.post("/api/search", async (req, res) => {
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Missing query" });

    const providers: Array<[string, (q: string) => Promise<SearchHit[]>]> = [
      ["searxng", searchSearxng],
      ["google", searchGoogleCse],
      ["brave", searchBrave],
      ["duckduckgo", searchDuckDuckGo],
    ];

    const errors: string[] = [];

    for (const [name, fn] of providers) {
      try {
        const results = await fn(query);
        if (results.length > 0) {
          return res.json({
            query,
            provider: name,
            results,
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        const msg = err?.name === "AbortError" ? "timed out" : err?.message || "failed";
        console.warn(`[spidey] search provider "${name}" ${msg}`);
        errors.push(`${name}: ${msg}`);
      }
    }

    // Every provider struck out. Report it honestly so Spidey says so
    // rather than answering from training data and calling it a search.
    res.status(502).json({
      error: `No search results. ${errors.join("; ") || "All providers returned nothing."}`,
    });
  });

  /**
   * Google Tasks proxy.
   *
   * The browser CANNOT call tasks.googleapis.com/tasks/v1/lists/{id}/tasks
   * directly -- that endpoint returns no Access-Control-Allow-Origin header,
   * so Chrome blocks it at preflight. (The /users/@me/lists endpoint DOES
   * allow it, which is exactly why groups synced and tasks never did.)
   *
   * CORS is a browser rule, not a network rule. Server-to-server calls are
   * unaffected, so we relay through here.
   */
  app.post("/api/google-tasks", async (req, res) => {
    const { path: apiPath, method = "GET", token, body } = req.body || {};

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Missing access token" });
    }
    if (!apiPath || typeof apiPath !== "string" || !apiPath.startsWith("/")) {
      return res.status(400).json({ error: "Invalid API path" });
    }
    // Only ever talk to the Tasks API -- never let a caller aim this elsewhere.
    if (apiPath.includes("..") || apiPath.includes("://")) {
      return res.status(400).json({ error: "Invalid API path" });
    }

    const url = `https://tasks.googleapis.com/tasks/v1${apiPath}`;

    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const init: any = { method, headers };
      if (body !== undefined && method !== "GET" && method !== "DELETE") {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      init.signal = controller.signal;

      const r = await fetch(url, init);
      clearTimeout(timer);

      if (r.status === 204) return res.status(204).end();

      const text = await r.text();
      if (!r.ok) {
        console.error(`[spidey] Google Tasks ${method} ${apiPath} -> ${r.status}`);
        return res.status(r.status).json({
          error: `Google Tasks API ${r.status}: ${text.slice(0, 300)}`,
        });
      }

      res.type("application/json").send(text || "{}");
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "Google Tasks request timed out." : err?.message;
      console.error(`[spidey] Google Tasks proxy failed:`, msg);
      res.status(502).json({ error: msg || "Proxy request failed" });
    }
  });

  // Vite Middleware (Dev) vs Static Files (Prod)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Spidey Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();