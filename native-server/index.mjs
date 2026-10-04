import http from "node:http";
import { createAds } from "./ads.mjs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Stripe from "stripe";
import { createStore, fail } from "./store.mjs";
import { createBilling } from "./billing.mjs";
import { recognize } from "./recognition.mjs";

export function createApplication({
  store,
  stripe,
  recognizeCar = recognize,
  publicUrl = process.env.PUBLIC_URL || "http://localhost:4242",
}) {
  const billing = createBilling(stripe, store, publicUrl.replace(/\/$/, ""));
  const ads = createAds(store);
  const locks = new Set();
  const limits = new Map();
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS || "http://localhost:8081"
  ).split(",");
  function rateLimit(key, max, duration) {
    const now = Date.now();
    if (limits.size > 10000)
      for (const [k, v] of limits) if (v.expires <= now) limits.delete(k);
    const state = limits.get(key) || { count: 0, expires: now + duration };
    if (state.expires <= now) {
      state.count = 0;
      state.expires = now + duration;
    }
    if (++state.count > max)
      throw fail(429, "Trop de demandes. Réessaie plus tard.");
    limits.set(key, state);
  }
  async function locked(key, fn) {
    if (locks.has(key)) throw fail(409, "Une opération est déjà en cours.");
    locks.add(key);
    try {
      return await fn();
    } finally {
      locks.delete(key);
    }
  }
  return http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };
    try {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin))
        throw fail(403, "Origine non autorisée");
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type",
        );
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.writeHead(204);
        return res.end();
      }
      const path = new URL(req.url, "http://localhost").pathname;
      if (req.method === "GET" && path.startsWith("/payment/")) {
        const label =
          path === "/payment/cancel"
            ? "Paiement annulé"
            : path === "/payment/success"
              ? "Merci ! Ton paiement est en cours de confirmation."
              : "Gestion du compte terminée";
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'",
        });
        return res.end(
          `<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CarDrive</title><body style="background:#08080f;color:#eee;font:18px system-ui;padding:40px"><h1 style="color:#fbbf24">CarDrive TCG</h1><h2>${label}</h2><p>Reviens dans CarDrive, puis ouvre la boutique et appuie sur « Actualiser mes achats ».</p></body></html>`,
        );
      }
      if (["/checkout", "/portal", "/webhooks/stripe"].includes(path) && process.env.ENABLE_PAYMENTS !== "true")
        throw fail(503, "Achats désactivés pendant la bêta connectée.");
      if (req.method === "GET" && path === "/ads/ssv") return send(200, await ads.callback(req.url));
      let raw = Buffer.alloc(0);
      if (req.method === "POST") {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4_200_000) throw fail(413, "Photo trop volumineuse");
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks);
      }
      if (req.method === "POST" && path === "/webhooks/stripe")
        return send(
          200,
          await billing.webhook(raw, req.headers["stripe-signature"]),
        );
      rateLimit(`ip:${req.socket.remoteAddress}`, 300, 60000);
      let body = {};
      if (raw.length) {
        try {
          body = JSON.parse(raw.toString());
        } catch {
          throw fail(400, "JSON invalide");
        }
      }
      if (req.method === "GET" && path === "/health")
        return send(200, { ok: true, service: "cardrive-native", version: 1 });
      if (req.method === "GET" && path === "/catalog")
        return send(200, { products: stripe ? await billing.catalog() : [] });
      if (
        req.method === "POST" &&
        ["/auth/register", "/auth/login"].includes(path)
      ) {
        rateLimit(`auth:${req.socket.remoteAddress}`, 15, 15 * 60000);
        const email = String(body.email || "")
          .trim()
          .toLowerCase();
        if (
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          typeof body.password !== "string" ||
          body.password.length < 12 ||
          body.password.length > 128
        )
          throw fail(
            400,
            "Adresse e-mail ou mot de passe invalide (12 à 128 caractères).",
          );
        const id = path.endsWith("register")
          ? await store.register(email, body.password)
          : await store.login(email, body.password);
        return send(200, { token: store.session(id) });
      }
      const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
      const id = store.authenticate(token);
      if (req.method === "POST" && path === "/ads/ticket") {
        rateLimit(`ads:${id}`, 10, 60000);
        return send(200, ads.ticket(id));
      }
      if (req.method === "POST" && path === "/auth/logout") {
        store.logout(token);
        return send(200, { ok: true });
      }
      if (req.method === "GET" && path === "/me") {
        await billing.syncPremium(id);
        return send(200, store.entitlements(id));
      }
      if (req.method === "POST" && path === "/checkout")
        return send(
          200,
          await locked(`checkout:${id}`, () =>
            billing.checkout(id, body.productId),
          ),
        );
      if (req.method === "POST" && path === "/portal")
        return send(200, await billing.portal(id));
      if (req.method === "POST" && path === "/recognize") {
        rateLimit(`scan:${id}`, 20, 60000);
        const result = await locked(`scan:${id}`, async () => {
          await billing.syncPremium(id);
          const current = store.entitlements(id);
          if (!current.isPremium && current.remaining <= 0)
            throw fail(402, "Plus de scans disponibles. Ouvre la boutique.");
          const car = await recognizeCar(body);
          store.consume(id);
          return { car, entitlements: store.entitlements(id) };
        });
        return send(200, result);
      }
      throw fail(404, "Route inconnue");
    } catch (error) {
      if (req.url?.split('?')[0] === '/ads/ssv') {
        const reason = error.status ? error.message : 'Erreur interne';
        console.warn('[AdMob SSV v2]', error.status || 500, reason);
      }
      if (!error.status)
        console.error("Request failed:", error.type || error.name);
      if (!res.headersSent)
        send(error.status || 500, {
          error: error.status
            ? error.message
            : "Service indisponible. Réessaie plus tard.",
        });
      else res.end();
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const dbPath = resolve(process.env.DATABASE_PATH || "./data/cardrive.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });
  const store = createStore(dbPath);
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        maxNetworkRetries: 2,
        timeout: 20000,
      })
    : null;
  const server = createApplication({ store, stripe });
  server.requestTimeout = 100000;
  server.listen(Number(process.env.PORT || 4242), "0.0.0.0", () =>
    console.log("CarDrive API ready"),
  );
  const stop = () =>
    server.close(() => {
      store.db.close();
      process.exit(0);
    });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
