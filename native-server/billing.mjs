import { randomUUID } from "node:crypto";
import { fail } from "./store.mjs";
export const PRODUCTS = [
  {
    id: "scans20",
    name: "Pack 20 scans",
    credits: 20,
    mode: "payment",
    env: "STRIPE_PRICE_SCANS20",
  },
  {
    id: "scans50",
    name: "Pack 50 scans",
    credits: 50,
    mode: "payment",
    env: "STRIPE_PRICE_SCANS50",
  },
  {
    id: "scans100",
    name: "Pack 100 scans",
    credits: 100,
    mode: "payment",
    env: "STRIPE_PRICE_SCANS100",
  },
  {
    id: "monthly",
    name: "Pass mensuel",
    credits: 0,
    mode: "subscription",
    interval: "month",
    env: "STRIPE_PRICE_MONTHLY",
  },
  {
    id: "yearly",
    name: "Pass annuel",
    credits: 0,
    mode: "subscription",
    interval: "year",
    env: "STRIPE_PRICE_YEARLY",
  },
];
export function createBilling(stripe, store, publicUrl) {
  const priceId = (product) => process.env[product.env];
  const needStripe = () => {
    if (!stripe) throw fail(503, "Boutique Stripe à configurer");
  };
  const customer = async (id) => {
    needStripe();
    const a = store.account(id);
    if (a.customer) return a.customer;
    const c = await stripe.customers.create(
      { email: a.email, metadata: { accountId: id } },
      { idempotencyKey: `account-${id}` },
    );
    store.setCustomer(id, c.id);
    return c.id;
  };
  const syncPremium = async (id) => {
    const a = store.account(id);
    if (!a.customer) return store.setPremium(id, 0);
    needStripe();
    const list = await stripe.subscriptions.list({
      customer: a.customer,
      status: "all",
      limit: 100,
    });
    const allowed = PRODUCTS.filter((p) => p.mode === "subscription")
      .map(priceId)
      .filter(Boolean);
    let until = 0;
    for (const sub of list.data) {
      if (!["active", "trialing"].includes(sub.status)) continue;
      for (const item of sub.items.data) {
        if (allowed.includes(item.price.id))
          until = Math.max(
            until,
            (item.current_period_end || sub.current_period_end || 0) * 1000,
          );
      }
    }
    store.setPremium(id, until);
  };
  const catalog = async () => {
    needStripe();
    return Promise.all(
      PRODUCTS.filter((p) => priceId(p)).map(async (p) => {
        const price = await stripe.prices.retrieve(priceId(p));
        if (
          !price.active ||
          !Number.isInteger(price.unit_amount) ||
          price.currency !== "eur" ||
          price.billing_scheme !== "per_unit" ||
          (p.mode === "payment"
            ? Boolean(price.recurring)
            : price.recurring?.interval !== p.interval ||
              price.recurring?.interval_count !== 1)
        )
          throw fail(503, "Un tarif Stripe est mal configuré");
        return {
          id: p.id,
          name: p.name,
          mode: p.mode,
          credits: p.credits,
          amount: price.unit_amount,
          currency: price.currency,
          interval: p.interval || null,
        };
      }),
    );
  };
  const fulfill = async (sessionId) => {
    needStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });
    if (
      session.status !== "complete" ||
      !["paid", "no_payment_required"].includes(session.payment_status)
    )
      return;
    const p = PRODUCTS.find((p) => p.id === session.metadata?.productId);
    const id = session.metadata?.accountId;
    const a = id && store.account(id);
    if (
      !p ||
      !a ||
      a.customer !== session.customer ||
      session.mode !== p.mode ||
      session.line_items?.data.length !== 1 ||
      session.line_items.data[0].price?.id !== priceId(p) ||
      session.line_items.data[0].quantity !== 1
    )
      throw fail(400, "Commande Stripe incohérente");
    store.fulfill(session.id, id, p.id, p.credits);
    if (p.mode === "subscription") await syncPremium(id);
  };
  return {
    catalog,
    syncPremium,
    fulfill,
    async checkout(id, productId) {
      needStripe();
      const p = PRODUCTS.find((p) => p.id === productId && priceId(p));
      if (!p) throw fail(400, "Offre indisponible");
      await catalog();
      const c = await customer(id);
      await syncPremium(id);
      if (p.mode === "subscription" && store.entitlements(id).isPremium)
        throw fail(
          409,
          "Un Pass est déjà actif. Utilise la gestion de l’abonnement.",
        );
      // One open Checkout per account prevents double taps and simultaneous subscriptions.
      let attempt = store.db
        .prepare("SELECT * FROM checkout_attempts WHERE account_id=?")
        .get(id);
      if (attempt && attempt.expires > Date.now()) {
        if (attempt.product !== productId) {
          if (attempt.session) {
            const previous = await stripe.checkout.sessions.retrieve(
              attempt.session,
            );
            if (previous.status === "open")
              await stripe.checkout.sessions.expire(previous.id);
            else if (previous.status === "complete") {
              await fulfill(previous.id);
              throw fail(
                409,
                "Un achat vient de terminer. Actualise tes achats.",
              );
            }
          } else
            throw fail(
              409,
              "Une commande est en cours, réessaie dans quelques instants.",
            );
          attempt = null;
        } else if (attempt.session) {
          const previous = await stripe.checkout.sessions.retrieve(
            attempt.session,
          );
          if (previous.status === "open") return { url: previous.url };
          if (previous.status === "complete") await fulfill(previous.id);
          // Ask for an explicit second tap before another purchase.
          store.db
            .prepare("DELETE FROM checkout_attempts WHERE account_id=?")
            .run(id);
          throw fail(
            409,
            "Commande précédente terminée. Actualise tes achats avant de recommencer.",
          );
        }
      } else attempt = null;
      if (!attempt) {
        attempt = { attempt: randomUUID(), expires: Date.now() + 31 * 60000 };
        store.db
          .prepare("INSERT OR REPLACE INTO checkout_attempts VALUES(?,?,?,?,?)")
          .run(id, productId, attempt.attempt, null, attempt.expires);
      }
      const metadata = { accountId: id, productId: p.id };
      const session = await stripe.checkout.sessions.create(
        {
          customer: c,
          mode: p.mode,
          line_items: [{ price: priceId(p), quantity: 1 }],
          payment_method_types: ["card"],
          allow_promotion_codes: true,
          metadata,
          client_reference_id: id,
          ...(p.mode === "subscription"
            ? { subscription_data: { metadata } }
            : {}),
          success_url: `${publicUrl}/payment/success`,
          cancel_url: `${publicUrl}/payment/cancel`,
          expires_at: Math.floor(attempt.expires / 1000),
        },
        { idempotencyKey: attempt.attempt },
      );
      store.db
        .prepare(
          "UPDATE checkout_attempts SET session=? WHERE account_id=? AND attempt=?",
        )
        .run(session.id, id, attempt.attempt);
      return { url: session.url };
    },
    async portal(id) {
      const c = await customer(id);
      return stripe.billingPortal.sessions.create({
        customer: c,
        return_url: `${publicUrl}/payment/return`,
      });
    },
    async webhook(raw, signature) {
      needStripe();
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          raw,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        throw fail(400, "Signature webhook invalide");
      }
      const object = event.data.object;
      if (
        [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
        ].includes(event.type)
      )
        await fulfill(object.id);
      if (
        event.type.startsWith("customer.subscription.") ||
        ["invoice.paid", "invoice.payment_failed"].includes(event.type)
      ) {
        const a = store.db
          .prepare("SELECT id FROM accounts WHERE customer=?")
          .get(object.customer);
        if (a) await syncPremium(a.id);
      }
      if (
        event.type === "charge.refunded" &&
        object.refunded &&
        object.payment_intent
      ) {
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: object.payment_intent,
          limit: 100,
        });
        for (const s of sessions.data) {
          if (!s.metadata?.accountId) continue;
          await fulfill(s.id);
          store.refund(s.id);
        }
      }
      return { received: true };
    },
  };
}
