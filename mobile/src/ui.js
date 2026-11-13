import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { C } from "./theme";
import { abs } from "./api";

export const hhmm = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const initials = (n = "?") => n.trim().slice(0, 2).toUpperCase();
export const lastSeenText = (d) => {
  if (!d) return "offline";
  const dt = new Date(d), today = new Date().toDateString() === dt.toDateString();
  return "last seen " + (today ? "today " : dt.toLocaleDateString([], { month: "short", day: "numeric" }) + " ") + hhmm(dt);
};

export function Avatar({ name, uri, size = 48 }) {
  const r = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri: abs(uri) }} style={r} />;
  return (
    <LinearGradient colors={[C.accent, C.accent2]} style={[r, { alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.36 }}>{initials(name)}</Text>
    </LinearGradient>
  );
}

export function GradButton({ title, onPress, busy, colors = C.mine }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{title}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

export function Ticks({ m }) {
  const read = !!m.readAt, delivered = !!m.deliveredAt;
  return <Text style={{ fontSize: 11, color: read ? "#7FE3FF" : "rgba(238,240,255,0.6)" }}>{delivered || read ? "✓✓" : "✓"}</Text>;
}

export const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  brand: { color: C.text, fontSize: 34, fontWeight: "800", marginTop: 16, letterSpacing: 0.3 },
  tagline: { color: C.sub, marginTop: 6, textAlign: "center", paddingHorizontal: 40 },
  input: { backgroundColor: C.surface, color: C.text, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, borderWidth: 1, borderColor: C.line },
  btn: { borderRadius: 16, paddingVertical: 15, alignItems: "center", paddingHorizontal: 18 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  title: { color: C.text, fontSize: 24, fontWeight: "800" },
  back: { color: C.accent, fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  name: { color: C.text, fontSize: 16, fontWeight: "600" },
  preview: { color: C.sub, marginTop: 2, fontSize: 14 },
  time: { color: C.sub, fontSize: 12 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.warm, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginTop: 4 },
  badgeText: { color: "#1a0d08", fontSize: 12, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, marginTop: 120 },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: "700" },
  emptySub: { color: C.sub, textAlign: "center", marginTop: 8 },
  fabRow: { position: "absolute", right: 20, flexDirection: "row", gap: 10 },
  pill: { paddingHorizontal: 20, paddingVertical: 15, borderRadius: 28 },
  pillText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  bubble: { maxWidth: "82%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  mine: { alignSelf: "flex-end", borderBottomRightRadius: 5 },
  theirs: { alignSelf: "flex-start", backgroundColor: C.raised, borderBottomLeftRadius: 5 },
  sender: { color: C.accent, fontSize: 12, fontWeight: "700", marginBottom: 2 },
  msgText: { color: C.text, fontSize: 16, lineHeight: 21 },
  deleted: { color: C.sub, fontStyle: "italic", fontSize: 15 },
  stamp: { color: "rgba(238,240,255,0.6)", fontSize: 11 },
  photo: { width: 220, height: 220, borderRadius: 12 },
  quote: { backgroundColor: "rgba(0,0,0,0.25)", borderLeftWidth: 3, borderLeftColor: C.warm, borderRadius: 8, padding: 6, marginBottom: 4 },
  quoteName: { color: C.warm, fontSize: 12, fontWeight: "700" },
  quoteText: { color: C.text, opacity: 0.8, fontSize: 13 },
  reacts: { flexDirection: "row", gap: 4, marginTop: -4, marginBottom: 2 },
  react: { backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: C.line },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  replyBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line },
  attach: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  sendBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(5,6,15,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 6 },
  emojiRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  emojiBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.raised, alignItems: "center", justifyContent: "center" },
  sheetItem: { color: C.text, fontSize: 17, paddingVertical: 14 },
  label: { color: C.sub, fontSize: 13, marginBottom: 6, marginLeft: 4 },
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.accent },
  key: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  keyText: { color: C.text, fontSize: 28, fontWeight: "600" },
});
