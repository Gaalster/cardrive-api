import { DEMO_MODE } from "./config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  arrayUnion,
  arrayRemove,
  updateDoc,
} from "firebase/firestore";

import { totalScore } from "./game";

const STORAGE_KEY = DEMO_MODE ? "@cdtcg_demo_player_v1" : "@cdtcg_player_v4";

/* ══════════════════════════════════════════════════
   FIREBASE CONFIG
   → Remplace par ta config Firebase (console.firebase.google.com)
══════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey: "FIREBASE_API_KEY",
  authDomain: "FIREBASE_AUTH_DOMAIN",
  projectId: "FIREBASE_PROJECT_ID",
  storageBucket: "FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "FIREBASE_SENDER_ID",
  appId: "FIREBASE_APP_ID",
};

// Initialise Firebase une seule fois
export let db = null;
try {
  const app =
    getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  if (!DEMO_MODE && !FIREBASE_CONFIG.projectId.includes("FIREBASE_")) {
    db = getFirestore(app);
  }
} catch (e) {
  console.log("[Firebase] Non configuré, mode local uniquement");
}

// Prépare le player pour Firebase — sans imageUri (chemin local non transférable)
function toPublicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    nameLower: p.name.toLowerCase(),
    avatar: p.avatar,

    score: totalScore(p),
    garageCount: (p.garage || []).length,
    garage: (p.garage || []).map((c) => ({ ...c, imageUri: null })),
    completions: p.completions || [],
    friends: p.friends || [],
    friendRequests: p.friendRequests || [],
    createdAt: p.createdAt,
    updatedAt: Date.now(),
  };
}

export async function syncToFirebase(player) {
  if (!db) return;
  try {
    await setDoc(doc(db, "players", player.id), toPublicPlayer(player), {
      merge: true,
    });
  } catch (e) {
    console.log("[Firebase] Sync échouée:", e.message);
  }
}

export async function fetchLeaderboard() {
  if (!db) return [];
  try {
    const q = query(
      collection(db, "players"),
      orderBy("score", "desc"),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch (e) {
    return [];
  }
}

export async function searchPlayerByName(name) {
  if (!db) return [];
  try {
    const q = query(
      collection(db, "players"),
      where("nameLower", ">=", name.toLowerCase()),
      where("nameLower", "<=", name.toLowerCase() + "\uf8ff"),
      limit(10),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch (e) {
    return [];
  }
}

export async function sendFriendRequest(fromPlayer, toPlayerId) {
  if (!db) return false;
  try {
    const req = {
      fromId: fromPlayer.id,
      fromName: fromPlayer.name,
      fromAvatar: fromPlayer.avatar,
      sentAt: Date.now(),
    };
    // setDoc merge est plus robuste que updateDoc — fonctionne même si le champ n'existe pas
    await setDoc(
      doc(db, "players", toPlayerId),
      { friendRequests: arrayUnion(req) },
      { merge: true },
    );
    return true;
  } catch (e) {
    console.log("[Firebase] sendFriendRequest erreur:", e.message);
    return false;
  }
}

export async function acceptFriendRequest(player, fromId) {
  if (!db) return;
  try {
    // Retire la demande + ajoute dans les amis des deux côtés
    const req = (player.friendRequests || []).find((r) => r.fromId === fromId);
    if (!req) return;
    await updateDoc(doc(db, "players", player.id), {
      friends: arrayUnion(fromId),
      friendRequests: arrayRemove(req),
    });
    await updateDoc(doc(db, "players", fromId), {
      friends: arrayUnion(player.id),
    });
  } catch (e) {
    console.log("[Firebase] acceptFriend erreur:", e.message);
  }
}

export async function declineFriendRequest(player, fromId) {
  if (!db) return;
  try {
    const req = (player.friendRequests || []).find((r) => r.fromId === fromId);
    if (req)
      await updateDoc(doc(db, "players", player.id), {
        friendRequests: arrayRemove(req),
      });
  } catch (e) {}
}

export async function removeFriend(myId, friendId) {
  if (!db) return;
  try {
    await updateDoc(doc(db, "players", myId), {
      friends: arrayRemove(friendId),
    });
    await updateDoc(doc(db, "players", friendId), {
      friends: arrayRemove(myId),
    });
  } catch (e) {}
}

export async function fetchPlayerById(id) {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "players", id));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    return null;
  }
}

export async function loadPlayer() {
  try {
    const id = await AsyncStorage.getItem(STORAGE_KEY + "_id");
    if (!id) return null;
    const raw = await AsyncStorage.getItem(STORAGE_KEY + "_" + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function savePlayer(player) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY + "_id", player.id);
    await AsyncStorage.setItem(
      STORAGE_KEY + "_" + player.id,
      JSON.stringify(player),
    );
  } catch (e) {
    console.error("Save error:", e);
  }
}
