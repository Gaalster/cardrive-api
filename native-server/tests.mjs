import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { createStore } from "./store.mjs";
import { createBilling } from "./billing.mjs";
import { normalizeCar } from "./recognition.mjs";
import { createApplication } from "./index.mjs";

process.env.STRIPE_PRICE_SCANS20 = "price_pack";
process.env.STRIPE_PRICE_MONTHLY = "price_month";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
const validCar = { make: "Porsche", model: "Boxster", confidence: 90 };
function fakeStripe() {
  const real = new Stripe("sk_test_test");
  const state = { subscriptions: [], sessions: new Map(), created: [] };
  const stripe = {
    webhooks: real.webhooks,
    customers: { create: async () => ({ id: "cus_test" }) },
    subscriptions: { list: async () => ({ data: state.subscriptions }) },
    prices: {
      retrieve: async (id) => ({
        id,
        active: true,
        currency: "eur",
        billing_scheme: "per_unit",
        unit_amount: id === "price_pack" ? 199 : 499,
        recurring:
          id === "price_pack" ? null : { interval: "month", interval_count: 1 },
      }),
    },
    checkout: {
      sessions: {
        retrieve: async (id) => state.sessions.get(id),
        create: async (params) => {
          const s = {
            id: "cs_new",
            status: "open",
            url: "https://checkout.stripe.com/test",
            ...params,
          };
          state.sessions.set(s.id, s);
          state.created.push(params);
          return s;
        },
        expire: async (id) => {
          state.sessions.get(id).status = "expired";
        },
        list: async () => ({ data: [...state.sessions.values()] }),
      },
    },
    billingPortal: {
      sessions: {
        create: async () => ({ url: "https://billing.stripe.com/test" }),
      },
    },
  };
  return { stripe, state };
}
async function fixture() {
  const store = createStore(":memory:");
  const id = await store.register("test@example.com", "secret-password-123");
  const { stripe, state } = fakeStripe();
  return {
    store,
    id,
    stripe,
    state,
    billing: createBilling(stripe, store, "https://example.com"),
  };
}

test("quotas: 5 gratuits puis crédits; refus sans solde; nouveau jour sans perte des achats", async () => {
  const { store, id } = await fixture();
  store.fulfill("cs_paid", id, "scans20", 20);
  for (let i = 0; i < 5; i++) store.consume(id);
  assert.equal(store.entitlements(id).credits, 20);
  store.consume(id);
  assert.equal(store.entitlements(id).credits, 19);
  for (let i = 0; i < 19; i++) store.consume(id);
  assert.throws(() => store.consume(id), /Plus de scans/);
  store.db
    .prepare("UPDATE accounts SET day=? WHERE id=?")
    .run("2000-01-01", id);
  assert.equal(store.entitlements(id).remaining, 5);
  store.db.close();
});

test("webhook signé, doublons, non payé et remboursement intégral idempotent", async () => {
  const { store, id, stripe, state, billing } = await fixture();
  store.setCustomer(id, "cus_test");
  const session = {
    id: "cs_paid",
    customer: "cus_test",
    status: "complete",
    payment_status: "unpaid",
    mode: "payment",
    metadata: { accountId: id, productId: "scans20" },
    line_items: { data: [{ price: { id: "price_pack" }, quantity: 1 }] },
  };
  state.sessions.set(session.id, session);
  const payload = JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { id: session.id } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  await assert.rejects(
    () => billing.webhook(Buffer.from(payload), "invalid"),
    /Signature/,
  );
  await billing.webhook(Buffer.from(payload), signature);
  assert.equal(store.entitlements(id).credits, 0);
  session.payment_status = "paid";
  await billing.webhook(Buffer.from(payload), signature);
  await billing.webhook(Buffer.from(payload), signature);
  assert.equal(store.entitlements(id).credits, 20);
  store.refund(session.id);
  store.refund(session.id);
  assert.equal(store.entitlements(id).credits, 0);
  await billing.webhook(Buffer.from(payload), signature);
  assert.equal(store.entitlements(id).credits, 0);
  store.db.close();
});

test("mauvais tarif et mauvais propriétaire ne créditent rien", async () => {
  const { store, id, state, billing } = await fixture();
  store.setCustomer(id, "cus_test");
  const s = {
    id: "cs_wrong",
    status: "complete",
    payment_status: "paid",
    mode: "payment",
    customer: "cus_other",
    metadata: { accountId: id, productId: "scans20" },
    line_items: { data: [{ price: { id: "price_pack" }, quantity: 1 }] },
  };
  state.sessions.set(s.id, s);
  await assert.rejects(() => billing.fulfill(s.id), /incohérente/);
  s.customer = "cus_test";
  s.line_items.data[0].price.id = "price_wrong";
  await assert.rejects(() => billing.fulfill(s.id), /incohérente/);
  assert.equal(store.entitlements(id).credits, 0);
  store.db.close();
});

test("abonnement: accès actif, fin de période et résiliation", async () => {
  const { store, id, state, billing } = await fixture();
  store.setCustomer(id, "cus_test");
  state.subscriptions = [
    {
      status: "active",
      items: {
        data: [
          {
            price: { id: "price_month" },
            current_period_end: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
      },
    },
  ];
  await billing.syncPremium(id);
  assert.equal(store.entitlements(id).isPremium, true);
  store.consume(id);
  assert.equal(store.entitlements(id).freeRemaining, 5);
  state.subscriptions[0].status = "canceled";
  await billing.syncPremium(id);
  assert.equal(store.entitlements(id).isPremium, false);
  state.subscriptions[0].status = "active";
  state.subscriptions[0].items.data[0].current_period_end = 1;
  await billing.syncPremium(id);
  assert.equal(store.entitlements(id).isPremium, false);
  store.db.close();
});

test("checkout: catalogue serveur et réutilisation du paiement ouvert", async () => {
  const { store, id, state, billing } = await fixture();
  const first = await billing.checkout(id, "scans20");
  const second = await billing.checkout(id, "scans20");
  assert.equal(first.url, second.url);
  assert.equal(state.created.length, 1);
  assert.deepEqual(state.created[0].line_items, [
    { price: "price_pack", quantity: 1 },
  ]);
  assert.equal(store.entitlements(id).credits, 0);
  await assert.rejects(
    () => billing.checkout(id, "free_premium"),
    /indisponible/,
  );
  store.db.close();
});

test("validation IA: zéro confiance rejeté, chiffres incohérents normalisés", () => {
  assert.throws(
    () => normalizeCar({ make: "Porsche", confidence: 0 }),
    /non identifié/,
  );
  assert.throws(
    () => normalizeCar({ make: "Inconnu", confidence: 100 }),
    /non identifié/,
  );
  const car = normalizeCar({
    ...validCar,
    power_hp: -10,
    top_speed_kmh: "NaN",
  });
  assert.equal(car.power_hp, 0);
  assert.equal(car.top_speed_kmh, 0);
});

test("API: authentification, photo ratée non débitée, débit réussi, déconnexion", async () => {
  const { store, id, stripe } = await fixture();
  let failRecognition = true;
  const server = createApplication({
    store,
    stripe,
    recognizeCar: async () => {
      if (failRecognition)
        throw Object.assign(new Error("Photo incorrecte"), { status: 422 });
      return validCar;
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = store.session(id);
  const request = (path, body, auth = token) =>
    fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${auth}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.equal((await request("/me", null, "fake")).status, 401);
    for (const route of ["/checkout", "/portal", "/webhooks/stripe"])
      assert.equal((await request(route, {})).status, 503);
    assert.equal(
      (await request("/recognize", { base64: "photo" })).status,
      422,
    );
    assert.equal(store.entitlements(id).remaining, 5);
    failRecognition = false;
    const r = await request("/recognize", {
      base64: "photo",
      isPremium: true,
      credits: 999,
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).entitlements.remaining, 4);
    await request("/auth/logout", {});
    assert.equal((await request("/me")).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});

test("connexion: mot de passe erroné refusé et session expirée refusée", async () => {
  const { store, id } = await fixture();
  assert.equal(
    await store.login("test@example.com", "secret-password-123"),
    id,
  );
  await assert.rejects(
    () => store.login("test@example.com", "wrong-password"),
    /incorrects/,
  );
  const token = store.session(id);
  store.db.prepare("UPDATE sessions SET expires=0").run();
  assert.throws(() => store.authenticate(token), /Connecte/);
  store.db.close();
});
