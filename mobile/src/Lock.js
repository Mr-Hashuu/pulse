import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "./theme";
import Logo from "./Logo";
import { s } from "./ui";

export const getPin = () => SecureStore.getItemAsync("pulse_pin").catch(() => null);
export const setPin = (p) => SecureStore.setItemAsync("pulse_pin", p);
export const clearPin = () => SecureStore.deleteItemAsync("pulse_pin");

export function PinPad({ title, error, onComplete, onCancel }) {
  const [v, setV] = useState("");
  const insets = useSafeAreaInsets();
  useEffect(() => { if (v.length === 4) { const t = setTimeout(() => { onComplete(v); setV(""); }, 120); return () => clearTimeout(t); } }, [v]);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <View style={[s.fill, { alignItems: "center", paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
      <Logo size={64} />
      <Text style={[s.title, { marginTop: 20 }]}>{title}</Text>
      <Text style={{ color: C.danger, height: 22, marginTop: 6 }}>{error || ""}</Text>
      <View style={{ flexDirection: "row", gap: 16, marginVertical: 24 }}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={[s.pinDot, v.length > i && { backgroundColor: C.accent }]} />)}
      </View>
      <View style={{ width: 260, flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
        {keys.map((k, i) => k === "" ? <View key={i} style={s.key} /> : (
          <Pressable key={i} style={s.key} onPress={() => setV(k === "⌫" ? v.slice(0, -1) : v.length < 4 ? v + k : v)}>
            <Text style={s.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      {onCancel && <Pressable onPress={onCancel} style={{ marginTop: 28 }}><Text style={s.back}>Cancel</Text></Pressable>}
    </View>
  );
}

export function LockScreen({ onUnlock }) {
  const [err, setErr] = useState("");
  return <PinPad title="Enter PIN" error={err} onComplete={async (p) => { if (p === (await getPin())) onUnlock(); else setErr("Wrong PIN, try again"); }} />;
}

export function PinSetup({ onDone, onCancel }) {
  const [first, setFirst] = useState(null);
  const [err, setErr] = useState("");
  return (
    <PinPad
      title={first ? "Confirm your PIN" : "Choose a 4-digit PIN"}
      error={err}
      onCancel={onCancel}
      onComplete={async (p) => {
        if (!first) { setFirst(p); setErr(""); }
        else if (p === first) { await setPin(p); onDone(); }
        else { setFirst(null); setErr("PINs didn't match. Start again."); }
      }}
    />
  );
}
