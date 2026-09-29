import { DEMO_MODE } from "./config";
import { demoApi } from "./demo";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
const SESSION_KEY = "cardrive.session.v1";
let memoryToken;

async function getToken() {
  if (memoryToken !== undefined) return memoryToken;
  memoryToken =
    Platform.OS === "web"
      ? globalThis.sessionStorage?.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);
  return memoryToken;
}

export async function setToken(token) {
  if (Platform.OS === "web") {
    if (token) globalThis.sessionStorage?.setItem(SESSION_KEY, token);
    else globalThis.sessionStorage?.removeItem(SESSION_KEY);
  } else if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
  else await SecureStore.deleteItemAsync(SESSION_KEY);
  memoryToken = token;
}

export async function api(path, body) {
  if (DEMO_MODE) return demoApi(path, body);
  if (!BASE_URL) throw new Error("Serveur à configurer");
  const token = await getToken();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    path === "/recognize" ? 90000 : 25000,
  );
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) await setToken(null);
      throw new Error(data.error || "Le serveur est indisponible");
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "Délai dépassé. Actualise ton compte avant de réessayer.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
