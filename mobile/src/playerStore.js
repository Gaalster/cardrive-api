import { createAccountStorage } from "./accountStorage.mjs";
import { DEMO_MODE } from "./config";
import AsyncStorage from "@react-native-async-storage/async-storage";
const STORAGE_KEY = DEMO_MODE ? "@cdtcg_demo_player_v1" : "@cdtcg_player_v4";
const accountStorage = createAccountStorage(AsyncStorage, STORAGE_KEY);
export async function loadPlayer(accountId) {
  return accountStorage.load(DEMO_MODE ? 'demo' : accountId);
}
export async function savePlayer(player) {
  return accountStorage.save(DEMO_MODE ? {...player, accountId:'demo'} : player);
}
export async function clearLocalPlayer(accountId) {
  return accountStorage.remove(DEMO_MODE ? 'demo' : accountId);
}
