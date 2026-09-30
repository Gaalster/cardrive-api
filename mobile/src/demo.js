import AsyncStorage from "@react-native-async-storage/async-storage";
const KEY = "@cardrive_demo_wallet_v1";
export const DEMO_PRODUCTS = [
  {
    id: "scans20",
    name: "Pack 20 scans",
    credits: 20,
    mode: "payment",
    amount: 199,
    currency: "eur",
  },
  {
    id: "scans50",
    name: "Pack 50 scans",
    credits: 50,
    mode: "payment",
    amount: 399,
    currency: "eur",
  },
  {
    id: "scans100",
    name: "Pack 100 scans",
    credits: 100,
    mode: "payment",
    amount: 699,
    currency: "eur",
  },
  {
    id: "monthly",
    name: "Pass mensuel",
    credits: 0,
    mode: "subscription",
    interval: "month",
    amount: 499,
    currency: "eur",
  },
  {
    id: "yearly",
    name: "Pass annuel",
    credits: 0,
    mode: "subscription",
    interval: "year",
    amount: 3499,
    currency: "eur",
  },
];
const cars = [
  {
    make: "Porsche",
    model: "Boxster 986",
    year: "2002",
    category: "Cabriolet",
    country_of_origin: "Allemagne",
    world_units_produced: 164874,
    france_units_estimated: 4000,
    power_hp: 220,
    top_speed_kmh: 250,
    zero_to_100: 6.6,
    price_eur_new: 45000,
  },
  {
    make: "Toyota",
    model: "GR Yaris",
    year: "2024",
    category: "Sportive",
    country_of_origin: "Japon",
    world_units_produced: 40000,
    france_units_estimated: 1500,
    power_hp: 280,
    top_speed_kmh: 230,
    zero_to_100: 5.2,
    price_eur_new: 46000,
  },
  {
    make: "Ferrari",
    model: "F40",
    year: "1990",
    category: "Supercar",
    country_of_origin: "Italie",
    world_units_produced: 1311,
    france_units_estimated: 50,
    power_hp: 478,
    top_speed_kmh: 324,
    zero_to_100: 4.1,
    price_eur_new: 200000,
  },
];
const day = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
async function load() {
  let saved;
  try {
    saved = JSON.parse(await AsyncStorage.getItem(KEY));
  } catch {}
  const wallet = saved || {
    day: day(),
    used: 0,
    credits: 0,
    premium: false,
    index: 0,
  };
  if (wallet.day !== day()) {
    wallet.day = day();
    wallet.used = 0;
  }
  return wallet;
}
const status = (wallet) => ({
  email: "demo@cardrive.local",
  isPremium: wallet.premium,
  credits: wallet.credits,
  freeRemaining: Math.max(0, 5 - wallet.used),
  remaining: Math.max(0, 5 - wallet.used) + wallet.credits,
});
let queue = Promise.resolve();
export function demoApi(path, body = {}) {
  const task = queue.then(async () => {
    const wallet = await load();
    let result;
    switch (path) {
      case "/catalog":
        return { products: DEMO_PRODUCTS };
      case "/me":
        return status(wallet);
      case "/demo/reset":
        Object.assign(wallet, {
          day: day(),
          used: 0,
          credits: 0,
          premium: false,
          index: 0,
        });
        result = status(wallet);
        break;
      case "/checkout": {
        const product = DEMO_PRODUCTS.find((p) => p.id === body.productId);
        if (!product) throw new Error("Offre démo inconnue");
        if (product.mode === "subscription") wallet.premium = true;
        else wallet.credits += product.credits;
        result = { demo: true };
        break;
      }
      case "/portal":
        wallet.premium = false;
        result = { demo: true };
        break;
      case "/recognize": {
        if (!wallet.premium) {
          if (wallet.used < 5) wallet.used++;
          else if (wallet.credits > 0) wallet.credits--;
          else
            throw new Error("Scans démo épuisés. Simule un pack dans le Shop.");
        }
        const car = {
          ...cars[wallet.index % cars.length],
          confidence: 100,
          fun_fact:
            "CARTE DE DÉMONSTRATION : modèle prédéfini, chiffres illustratifs. La photo n’a pas été analysée.",
        };
        wallet.index++;
        result = { car, entitlements: status(wallet) };
        break;
      }
      default:
        throw new Error("Action indisponible en démonstration");
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(wallet));
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
