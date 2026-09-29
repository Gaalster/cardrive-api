import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { DEMO_MODE } from "./config";

// Keep photos outside the camera/manipulator cache. No cloud upload here.
export async function keepPhoto(uri, base64) {
  if (Platform.OS === "web") return `data:image/jpeg;base64,${base64}`;
  const directory = `${FileSystem.documentDirectory}${DEMO_MODE ? "demo-cards" : "cards"}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}
