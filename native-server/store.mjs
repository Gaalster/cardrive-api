import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export const dayKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const tokenHash = (value) =>
  createHash("sha256").update(value).digest("hex");
export const fail = (status, message) =>
  Object.assign(new Error(message), { status });

export function createStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, customer TEXT UNIQUE, credits INTEGER NOT NULL DEFAULT 0, premium_until INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL DEFAULT '', used INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), product TEXT NOT NULL, credits INTEGER NOT NULL, refunded INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS checkout_attempts (account_id TEXT PRIMARY KEY REFERENCES accounts(id), product TEXT NOT NULL, attempt TEXT NOT NULL, session TEXT, expires INTEGER NOT NULL);
  `);
  const account = (id) =>
    db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const resetDay = (id) =>
    db
      .prepare("UPDATE accounts SET day=?, used=0 WHERE id=? AND day<>?")
      .run(dayKey(), id, dayKey());
  const entitlements = (id) => {
    resetDay(id);
    const a = account(id);
    const freeRemaining = Math.max(0, 5 - a.used);
    return {
      email: a.email,
      isPremium: a.premium_until > Date.now(),
      credits: Math.max(0, a.credits),
      freeRemaining,
      remaining: freeRemaining + Math.max(0, a.credits),
    };
  };
  return {
    db,
    account,
    entitlements,
    transaction,
    async register(email, password) {
      const salt = randomBytes(16).toString("hex");
      const hash = (await scrypt(password, salt, 64)).toString("hex");
      const id = randomUUID();
      try {
        db.prepare("INSERT INTO accounts(id,email,password) VALUES(?,?,?)").run(
          id,
          email,
          `${salt}:${hash}`,
        );
      } catch (e) {
        if (e.message.includes("UNIQUE"))
          throw fail(409, "Adresse déjà utilisée. Connecte-toi.");
        throw e;
      }
      return id;
    },
    async login(email, password) {
      const a = db.prepare("SELECT * FROM accounts WHERE email=?").get(email);
      const [salt, hash] = (
        a?.password || `${"0".repeat(32)}:${"0".repeat(128)}`
      ).split(":");
      const candidate = await scrypt(password, salt, 64);
      if (!a || !timingSafeEqual(candidate, Buffer.from(hash, "hex")))
        throw fail(401, "Identifiants incorrects");
      return a.id;
    },
    session(id) {
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        tokenHash(token),
        id,
        Date.now() + 30 * 86400000,
      );
      return token;
    },
    authenticate(token) {
      const session = db
        .prepare("SELECT * FROM sessions WHERE hash=? AND expires>?")
        .get(tokenHash(token || ""), Date.now());
      if (!session) throw fail(401, "Connecte-toi dans la boutique");
      return session.account_id;
    },
    logout(token) {
      db.prepare("DELETE FROM sessions WHERE hash=?").run(tokenHash(token));
    },
    setCustomer(id, customer) {
      db.prepare("UPDATE accounts SET customer=? WHERE id=?").run(customer, id);
    },
    setPremium(id, until) {
      db.prepare("UPDATE accounts SET premium_until=? WHERE id=?").run(
        until,
        id,
      );
    },
    fulfill(sessionId, id, product, credits) {
      return transaction(() => {
        const result = db
          .prepare(
            "INSERT OR IGNORE INTO orders(id,account_id,product,credits) VALUES(?,?,?,?)",
          )
          .run(sessionId, id, product, credits);
        if (result.changes)
          db.prepare("UPDATE accounts SET credits=credits+? WHERE id=?").run(
            credits,
            id,
          );
        return Boolean(result.changes);
      });
    },
    refund(sessionId) {
      transaction(() => {
        const order = db
          .prepare("SELECT * FROM orders WHERE id=?")
          .get(sessionId);
        if (!order || order.refunded) return;
        // Negative balance offsets later purchases if refunded scans were already spent.
        db.prepare("UPDATE accounts SET credits=credits-? WHERE id=?").run(
          order.credits,
          order.account_id,
        );
        db.prepare("UPDATE orders SET refunded=1 WHERE id=?").run(sessionId);
      });
    },
    consume(id) {
      return transaction(() => {
        resetDay(id);
        const a = account(id);
        if (a.premium_until > Date.now()) return;
        if (a.used < 5)
          db.prepare("UPDATE accounts SET used=used+1 WHERE id=?").run(id);
        else if (a.credits > 0)
          db.prepare("UPDATE accounts SET credits=credits-1 WHERE id=?").run(
            id,
          );
        else
          throw fail(
            402,
            "Plus de scans disponibles. Recharge dans la boutique.",
          );
      });
    },
  };
}
