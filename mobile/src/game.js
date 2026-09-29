export const C = {
  bg: "#08080f",
  surface: "#0e0e1a",
  card: "#12121e",
  border: "#1e1e30",
  text: "#f0f0f8",
  muted: "#4a4a6a",
  accent: "#FBBF24",
};

/* ══════════════════════════════════════════════════
   RARITY SYSTEM
══════════════════════════════════════════════════ */
export const RARITIES = {
  COMMON: {
    id: "COMMON",
    label: "Common",
    emoji: "⚪",
    color: "#9CA3AF",
    stars: 1,
    score: 10,
  },
  UNCOMMON: {
    id: "UNCOMMON",
    label: "Uncommon",
    emoji: "🟢",
    color: "#34D399",
    stars: 2,
    score: 30,
  },
  RARE: {
    id: "RARE",
    label: "Rare",
    emoji: "🔵",
    color: "#60A5FA",
    stars: 3,
    score: 100,
  },
  EPIC: {
    id: "EPIC",
    label: "Epic",
    emoji: "🟣",
    color: "#A78BFA",
    stars: 4,
    score: 300,
  },
  LEGENDARY: {
    id: "LEGENDARY",
    label: "Legendary",
    emoji: "🟡",
    color: "#FBBF24",
    stars: 5,
    score: 1000,
  },
};

export function computeRarity(world, country) {
  const ratio = country / Math.max(world, 1);
  if (!Number.isFinite(world) || world <= 0) return RARITIES.COMMON;
  if (world > 500000 && ratio > 0.004) return RARITIES.COMMON;
  if (world > 100000 && ratio > 0.001) return RARITIES.UNCOMMON;
  if (world > 10000) return RARITIES.RARE;
  if (world > 500) return RARITIES.EPIC;
  return RARITIES.LEGENDARY;
}

/* ══════════════════════════════════════════════════
   CHALLENGE SYSTEM
══════════════════════════════════════════════════ */
export const CHALLENGES = [
  {
    id: "ch1",
    label: "Chasseur de légendes",
    description: "Scanne une Legendary",
    freq: "weekly",
    bonusScore: 500,
    icon: "🟡",
    targetRarity: "LEGENDARY",
  },
  {
    id: "ch2",
    label: "Collectionneur Epic",
    description: "Capture une Epic ou mieux",
    freq: "daily",
    bonusScore: 150,
    icon: "🟣",
    minRarityScore: 300,
  },
  {
    id: "ch3",
    label: "Pilote de supercar",
    description: "Scanne une Supercar/Hypercar",
    freq: "weekly",
    bonusScore: 300,
    icon: "🏎️",
    targetCategory: "Supercar",
  },
  {
    id: "ch4",
    label: "Éco-chasseur",
    description: "Capture une Électrique",
    freq: "weekly",
    bonusScore: 200,
    icon: "⚡",
    targetCategory: "Électrique",
  },
  {
    id: "ch5",
    label: "Chasseur quotidien",
    description: "Trouve une Rare ou mieux",
    freq: "daily",
    bonusScore: 80,
    icon: "🔵",
    minRarityScore: 100,
  },
  {
    id: "ch6",
    label: "JDM Hunter",
    description: "Scanne une voiture japonaise",
    freq: "weekly",
    bonusScore: 180,
    icon: "🇯🇵",
    targetOrigin: "Japon",
  },
  {
    id: "ch7",
    label: "La Dolce Vita",
    description: "Scanne une voiture italienne",
    freq: "monthly",
    bonusScore: 400,
    icon: "🇮🇹",
    targetOrigin: "Italie",
  },
];

export const FREQ_LABEL = {
  daily: "Quotidien",
  weekly: "Hebdo",
  monthly: "Mensuel",
};
export const FREQ_COLOR = {
  daily: "#34D399",
  weekly: "#60A5FA",
  monthly: "#A78BFA",
};

export function getPeriodStart(freq) {
  const now = new Date();
  if (freq === "daily")
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (freq === "monthly")
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff).getTime();
}

export function getTimeLeft(freq) {
  const d = new Date();
  let next;
  if (freq === "daily")
    next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  else if (freq === "weekly") {
    const diff = 7 - (d.getDay() === 0 ? 7 : d.getDay());
    next = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + diff + 1,
    ).getTime();
  } else next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const ms = next - Date.now();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 48) return `${Math.floor(h / 24)}j ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function isStillLocked(completion, freq) {
  return completion && completion.periodStart >= getPeriodStart(freq);
}

export function carMatchesChallenge(car, ch) {
  if (ch.targetRarity && car.rarity?.id === ch.targetRarity) return true;
  if (ch.targetCategory && car.category === ch.targetCategory) return true;
  if (ch.targetOrigin && car.country_of_origin === ch.targetOrigin) return true;
  if (ch.minRarityScore && (car.rarity?.score || 0) >= ch.minRarityScore)
    return true;
  return false;
}

export const MAX_FUEL = 5;

export const garageScore = (g = []) =>
  g.reduce((s, c) => s + (c.rarity?.score || 0), 0);
export const bonusScore = (c = []) =>
  c.reduce((s, x) => s + (x.bonusScore || 0), 0);
export const totalScore = (p) =>
  garageScore(p?.garage) + bonusScore(p?.completions);
export const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
