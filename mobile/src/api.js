import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { io } from "socket.io-client";
import { SERVER_URL } from "./config";

let token = null;
export const setToken = (t) => { token = t; };
export const abs = (u) => (!u ? null : u.startsWith("http") ? u : SERVER_URL + u);

export async function api(path, opts = {}) {
  const res = await fetch(SERVER_URL + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export const connectSocket = () => io(SERVER_URL, { auth: { token }, transports: ["websocket"], reconnection: true });

export async function uploadFile(uri, path = "/upload") {
  const form = new FormData();
  form.append("file", { uri, name: "photo.jpg", type: "image/jpeg" });
  const res = await fetch(SERVER_URL + path, { method: "POST", headers: { Authorization: "Bearer " + token }, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}

// Messages and media are kept on the user's phone, like WhatsApp.
const key = (me, chat) => `chat:${me}:${chat}`;
export async function loadLocal(me, chat) {
  try { return JSON.parse((await AsyncStorage.getItem(key(me, chat))) || "[]"); } catch { return []; }
}
export async function saveLocal(me, chat, list) {
  try { await AsyncStorage.setItem(key(me, chat), JSON.stringify(list.slice(-1000))); } catch {}
}
export const mediaDir = () => FileSystem.documentDirectory + "media/";
export async function saveMediaLocally(mediaUrl) {
  await FileSystem.makeDirectoryAsync(mediaDir(), { intermediates: true }).catch(() => {});
  const dest = mediaDir() + mediaUrl.split("/").pop();
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists) await FileSystem.downloadAsync(SERVER_URL + mediaUrl, dest);
  return dest;
}
export { AsyncStorage, FileSystem };
