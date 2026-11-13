import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, AppState, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "./src/theme";
import Logo from "./src/Logo";
import CallManager from "./src/Call";
import { LockScreen, PinSetup, getPin, clearPin } from "./src/Lock";
import { Avatar, GradButton, Ticks, hhmm, lastSeenText, s } from "./src/ui";
import {
  AsyncStorage, FileSystem, api, abs, setToken, connectSocket, uploadFile,
  loadLocal, saveLocal, saveMediaLocally, mediaDir,
} from "./src/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
async function registerPush() {
  try {
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync("default", { name: "Messages", importance: Notifications.AndroidImportance.MAX });
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const t = await Notifications.getDevicePushTokenAsync();
    await api("/me/push", { method: "POST", body: { token: t.data } });
  } catch (e) { /* push needs google-services.json, see README */ }
}

const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
const previewOf = (l, me) =>
  !l ? "No messages yet" : l.deleted ? "Message deleted" : (l.from === me.id ? "You: " : "") + (l.mediaUrl ? "Photo" : l.text);
const toChat = (it) => it.kind === "group"
  ? { kind: "group", id: it.group.id, name: it.group.name, members: it.group.members }
  : { kind: "user", id: it.peer.id, name: it.peer.displayName, avatar: it.peer.avatar, username: it.peer.username };
const userChat = (u) => ({ kind: "user", id: u.id, name: u.displayName, avatar: u.avatar, username: u.username });

/* ---------------- Auth ---------------- */
function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const insets = useSafeAreaInsets();
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const body = mode === "login" ? { username, password } : { username, password, displayName };
      onAuthed(await api("/auth/" + mode, { method: "POST", body }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.fill, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 20 }]}>
      <View style={{ alignItems: "center", marginBottom: 36 }}>
        <Logo size={92} />
        <Text style={s.brand}>Pulse</Text>
        <Text style={s.tagline}>Messages that arrive the moment you send them.</Text>
      </View>
      <View style={{ paddingHorizontal: 24, gap: 12 }}>
        <TextInput style={s.input} placeholder="Username" placeholderTextColor={C.sub} autoCapitalize="none" value={username} onChangeText={setUsername} />
        {mode === "register" && <TextInput style={s.input} placeholder="Display name" placeholderTextColor={C.sub} value={displayName} onChangeText={setDisplayName} />}
        <TextInput style={s.input} placeholder="Password" placeholderTextColor={C.sub} secureTextEntry value={password} onChangeText={setPassword} />
        {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
        <GradButton title={mode === "login" ? "Sign in" : "Create account"} onPress={submit} busy={busy} />
        <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
          <Text style={{ color: C.sub, textAlign: "center", marginTop: 8 }}>
            {mode === "login" ? "New here? " : "Already have an account? "}
            <Text style={{ color: C.accent, fontWeight: "600" }}>{mode === "login" ? "Create an account" : "Sign in"}</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------------- Chats list ---------------- */
function Chats({ me, chats, loading, onOpen, onNew, onGroup, onProfile }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.fill, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Logo size={34} />
        <Text style={s.title}>Chats</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onProfile} hitSlop={10}><Avatar name={me.displayName} uri={me.avatar} size={36} /></Pressable>
      </View>
      {loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={chats}
          keyExtractor={(i) => (i.kind === "group" ? "g" + i.group.id : "u" + i.peer.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No chats yet</Text>
              <Text style={s.emptySub}>Tap New chat and search for a friend by username.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const c = toChat(item);
            return (
              <Pressable onPress={() => onOpen(c)} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.surface }]}>
                <Avatar name={c.name} uri={c.avatar} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={s.name}>{c.name}{c.kind === "group" ? "  ·  group" : ""}</Text>
                    {!!item.last && <Text style={s.time}>{hhmm(item.last.createdAt)}</Text>}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text numberOfLines={1} style={[s.preview, { flex: 1 }]}>{previewOf(item.last, me)}</Text>
                    {item.unread > 0 && <View style={s.badge}><Text style={s.badgeText}>{item.unread}</Text></View>}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <View style={[s.fabRow, { bottom: insets.bottom + 24 }]}>
        <Pressable onPress={onGroup}><View style={[s.pill, { backgroundColor: C.raised }]}><Text style={s.pillText}>New group</Text></View></Pressable>
        <Pressable onPress={onNew}><LinearGradient colors={C.mine} style={s.pill}><Text style={s.pillText}>New chat</Text></LinearGradient></Pressable>
      </View>
    </View>
  );
}

/* ---------------- Search / new group ---------------- */
function Search({ mode, onBack, onOpen, onCreated }) {
  const group = mode === "group";
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [sel, setSel] = useState({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => api("/users?q=" + encodeURIComponent(q)).then(setRes).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const ids = Object.keys(sel);
  const create = async () => {
    setBusy(true);
    try { onCreated(await api("/groups", { method: "POST", body: { name, members: ids } })); }
    catch (e) { Alert.alert("Couldn't create group", e.message); }
    setBusy(false);
  };
  return (
    <View style={[s.fill, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10}><Text style={s.back}>Back</Text></Pressable>
        <Text style={s.title}>{group ? "New group" : "New chat"}</Text>
      </View>
      <View style={{ padding: 12, gap: 10 }}>
        {group && <TextInput style={s.input} placeholder="Group name" placeholderTextColor={C.sub} value={name} onChangeText={setName} />}
        <TextInput autoFocus={!group} style={s.input} placeholder="Search username" placeholderTextColor={C.sub} autoCapitalize="none" value={q} onChangeText={setQ} />
        {group && ids.length > 0 && <Text style={{ color: C.accent }}>{ids.length} selected: {Object.values(sel).map((u) => u.displayName).join(", ")}</Text>}
      </View>
      <FlatList
        data={res}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={[s.emptySub, { marginTop: 30 }]}>{q.trim().length < 2 ? "Type at least 2 letters." : "No one found with that username."}</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => group ? setSel((p) => { const n = { ...p }; if (n[item.id]) delete n[item.id]; else n[item.id] = item; return n; }) : onOpen(userChat(item))}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: C.surface }]}>
            <Avatar name={item.displayName} uri={item.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.displayName}</Text>
              <Text style={s.preview}>@{item.username}</Text>
            </View>
            {group && sel[item.id] && <Text style={{ color: C.accent, fontSize: 20 }}>✓</Text>}
          </Pressable>
        )}
      />
      {group && <View style={{ padding: 16, paddingBottom: insets.bottom + 16 }}>
        <GradButton title="Create group" busy={busy} onPress={() => (name.trim() && ids.length ? create() : Alert.alert("Almost there", "Add a group name and pick at least one person."))} />
      </View>}
    </View>
  );
}

/* ---------------- Conversation ---------------- */
const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function Conversation({ me, chat, socket, bus, blocked, onToggleBlock, onCall, onBack }) {
  const isGroup = chat.kind === "group";
  const lkey = chat.kind + ":" + chat.id;
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(null);
  const [status, setStatus] = useState(null);
  const [names, setNames] = useState({});
  const [sheet, setSheet] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const insets = useSafeAreaInsets();
  const ref = useRef([]);
  const lastTyping = useRef(0);
  const typingTimer = useRef(null);
  const isBlocked = !isGroup && blocked.includes(chat.id);

  const belongs = (m) => (isGroup ? m.group === chat.id : !m.group && (m.from === chat.id || m.to === chat.id));
  const commit = useCallback((list) => { ref.current = list; setMsgs(list); saveLocal(me.id, lkey, list); }, [me.id, lkey]);

  const upsert = useCallback((m) => {
    const old = ref.current.find((x) => x._id === m._id);
    const merged = old ? { ...old, ...m, saved: old.saved } : m;
    commit(old ? ref.current.map((x) => (x._id === m._id ? merged : x)) : [...ref.current, merged].sort(byTime));
    if (m.mediaUrl && !m.deleted && !(old && old.saved))
      saveMediaLocally(m.mediaUrl).then(() => commit(ref.current.map((x) => (x._id === m._id ? { ...x, saved: true } : x)))).catch(() => {});
  }, [commit]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const local = await loadLocal(me.id, lkey);
      if (!alive) return;
      ref.current = local; setMsgs(local);
      if (isGroup) api("/groups/" + chat.id).then((g) => alive && setNames(Object.fromEntries(g.members.map((u) => [u.id, u.displayName])))).catch(() => {});
      else socket.emit("presence:get", { id: chat.id }, (r) => alive && setStatus(r));
      const since = local.reduce((a, m) => (m.updatedAt > a ? m.updatedAt : a), "");
      try {
        const fresh = await api((isGroup ? "/groupmsgs/" : "/messages/") + chat.id + (since ? "?since=" + encodeURIComponent(since) : ""));
        fresh.forEach((m) => alive && upsert(m));
      } catch {}
      if (!isGroup) socket.emit("read", { peer: chat.id });
    })();
    const off = bus.sub((ev, d) => {
      if (ev === "message" && belongs(d)) { upsert(d); if (!isGroup) socket.emit("read", { peer: chat.id }); }
      else if (ev === "update" && belongs(d)) upsert(d);
      else if (ev === "read" && !isGroup && d.by === chat.id)
        commit(ref.current.map((m) => (m.from === me.id && !m.readAt ? { ...m, readAt: d.at, deliveredAt: m.deliveredAt || d.at } : m)));
      else if (ev === "typing" && (isGroup ? d.group === chat.id : d.from === chat.id)) {
        setTyping(d.from); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => setTyping(null), 1800);
      } else if (ev === "presence" && !isGroup && d.uid === chat.id) setStatus({ online: d.online, lastSeen: d.lastSeen });
    });
    return () => { alive = false; off(); clearTimeout(typingTimer.current); };
  }, [chat.id]);

  const send = (payload) => {
    const rt = replyTo && replyTo._id; setReplyTo(null);
    socket.emit("message", { ...(isGroup ? { group: chat.id } : { to: chat.id }), ...payload, replyTo: rt }, (r) => {
      if (r && r.ok) upsert(r.message); else Alert.alert("Not sent", (r && r.error) || "Check your connection and try again.");
    });
  };
  const sendText = () => { const t = text.trim(); if (!t) return; setText(""); send({ text: t }); };
  const sendPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Photos blocked", "Allow photo access in Settings to send pictures.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (r.canceled) return;
    try {
      const up = await uploadFile(r.assets[0].uri);
      await FileSystem.makeDirectoryAsync(mediaDir(), { intermediates: true }).catch(() => {});
      await FileSystem.copyAsync({ from: r.assets[0].uri, to: mediaDir() + up.url.split("/").pop() }).catch(() => {});
      send({ mediaUrl: up.url, mediaType: up.type });
    } catch (e) { Alert.alert("Upload failed", e.message); }
  };
  const onChange = (t) => {
    setText(t);
    if (Date.now() - lastTyping.current > 1200) { lastTyping.current = Date.now(); socket.emit("typing", isGroup ? { group: chat.id } : { to: chat.id }); }
  };
  const nameOf = (id) => (id === me.id ? "You" : isGroup ? names[id] || "Someone" : chat.name);
  const imgUri = (m) => (m.saved ? mediaDir() + m.mediaUrl.split("/").pop() : abs(m.mediaUrl));

  const subtitle = typing ? (isGroup ? nameOf(typing) + " is typing…" : "typing…")
    : isGroup ? `${chat.members} members` : status ? (status.online ? "online" : lastSeenText(status.lastSeen)) : "@" + chat.username;

  const menu = () => Alert.alert(chat.name, undefined, [
    { text: "Cancel", style: "cancel" },
    { text: isBlocked ? "Unblock" : "Block", style: "destructive", onPress: () => onToggleBlock(chat.id, isBlocked) },
  ]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.fill, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10}><Text style={s.back}>Back</Text></Pressable>
        <Avatar name={chat.name} uri={chat.avatar} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{chat.name}</Text>
          <Text style={{ color: typing || status?.online ? C.accent : C.sub, fontSize: 12 }} numberOfLines={1}>{subtitle}</Text>
        </View>
        {!isGroup && <>
          <Pressable onPress={() => onCall(chat, false)} hitSlop={8}><Text style={{ fontSize: 22 }}>📞</Text></Pressable>
          <Pressable onPress={() => onCall(chat, true)} hitSlop={8}><Text style={{ fontSize: 22 }}>🎥</Text></Pressable>
          <Pressable onPress={menu} hitSlop={8}><Text style={{ fontSize: 24, color: C.text }}>⋮</Text></Pressable>
        </>}
      </View>

      <FlatList
        inverted
        data={[...msgs].reverse()}
        keyExtractor={(m) => m._id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={<Text style={[s.emptySub, { transform: [{ scaleY: -1 }], marginTop: 40 }]}>Say hello to {chat.name}.</Text>}
        renderItem={({ item }) => {
          const mine = item.from === me.id;
          const quoted = item.replyTo && msgs.find((x) => x._id === item.replyTo);
          const groups = (item.reactions || []).reduce((a, r) => ({ ...a, [r.emoji]: (a[r.emoji] || 0) + 1 }), {});
          const body = (
            <View style={{ gap: 4 }}>
              {isGroup && !mine && <Text style={s.sender}>{nameOf(item.from)}</Text>}
              {!!quoted && (
                <View style={s.quote}>
                  <Text style={s.quoteName}>{nameOf(quoted.from)}</Text>
                  <Text style={s.quoteText} numberOfLines={2}>{quoted.deleted ? "Message deleted" : quoted.mediaUrl ? "Photo" : quoted.text}</Text>
                </View>
              )}
              {item.deleted ? <Text style={s.deleted}>🚫 This message was deleted</Text> : <>
                {!!item.mediaUrl && <Image source={{ uri: imgUri(item) }} style={s.photo} />}
                {!!item.text && <Text style={s.msgText}>{item.text}</Text>}
              </>}
              <View style={{ flexDirection: "row", alignSelf: "flex-end", gap: 4 }}>
                <Text style={s.stamp}>{hhmm(item.createdAt)}</Text>
                {mine && !isGroup && !item.deleted && <Ticks m={item} />}
              </View>
            </View>
          );
          const bubbleStyle = [s.bubble, { maxWidth: "100%" }, mine ? { borderBottomRightRadius: 5 } : { backgroundColor: C.raised, borderBottomLeftRadius: 5 }];
          return (
            <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              <Pressable onLongPress={() => !item.deleted && setSheet(item)} delayLongPress={250}>
                {mine
                  ? <LinearGradient colors={C.mine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={bubbleStyle}>{body}</LinearGradient>
                  : <View style={bubbleStyle}>{body}</View>}
              </Pressable>
              {Object.keys(groups).length > 0 && (
                <View style={[s.reacts, { alignSelf: mine ? "flex-end" : "flex-start", marginTop: 2 }]}>
                  {Object.entries(groups).map(([e, n]) => <View key={e} style={s.react}><Text style={{ color: C.text, fontSize: 12 }}>{e} {n > 1 ? n : ""}</Text></View>)}
                </View>
              )}
            </View>
          );
        }}
      />

      {!!replyTo && (
        <View style={s.replyBar}>
          <View style={{ flex: 1 }}>
            <Text style={s.quoteName}>Replying to {nameOf(replyTo.from)}</Text>
            <Text style={s.quoteText} numberOfLines={1}>{replyTo.mediaUrl ? "Photo" : replyTo.text}</Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={10}><Text style={{ color: C.sub, fontSize: 18 }}>✕</Text></Pressable>
        </View>
      )}
      {isBlocked ? (
        <View style={[s.composer, { paddingBottom: insets.bottom + 12, justifyContent: "center" }]}>
          <Pressable onPress={() => onToggleBlock(chat.id, true)}><Text style={{ color: C.sub, paddingVertical: 12 }}>You blocked this contact. <Text style={{ color: C.accent }}>Unblock</Text></Text></Pressable>
        </View>
      ) : (
        <View style={[s.composer, { paddingBottom: insets.bottom + 8 }]}>
          <Pressable onPress={sendPhoto} style={s.attach}><Text style={{ color: C.accent, fontSize: 22, marginTop: -2 }}>+</Text></Pressable>
          <TextInput style={[s.input, { flex: 1, maxHeight: 120 }]} placeholder="Message" placeholderTextColor={C.sub} multiline value={text} onChangeText={onChange} />
          <Pressable onPress={sendText}><LinearGradient colors={C.mine} style={s.sendBtn}><Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text></LinearGradient></Pressable>
        </View>
      )}

      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={s.backdrop} onPress={() => setSheet(null)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={s.emojiRow}>
              {EMOJI.map((e) => (
                <Pressable key={e} style={s.emojiBtn} onPress={() => { socket.emit("react", { id: sheet._id, emoji: e }); setSheet(null); }}>
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => { setReplyTo(sheet); setSheet(null); }}><Text style={s.sheetItem}>Reply</Text></Pressable>
            {sheet && sheet.from === me.id && (
              <Pressable onPress={() => { socket.emit("delete", { id: sheet._id }); setSheet(null); }}>
                <Text style={[s.sheetItem, { color: C.danger }]}>Delete for everyone</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ---------------- Profile ---------------- */
function Profile({ me, hasPin, onBack, onUpdate, onSetPin, onRemovePin, onLogout }) {
  const [name, setName] = useState(me.displayName || "");
  const [about, setAbout] = useState(me.about || "");
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const pick = async () => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) return Alert.alert("Photos blocked", "Allow photo access in Settings.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (r.canceled) return;
    try { onUpdate(await uploadFile(r.assets[0].uri, "/me/avatar")); } catch (e) { Alert.alert("Upload failed", e.message); }
  };
  const save = async () => {
    setBusy(true);
    try { onUpdate(await api("/me", { method: "PUT", body: { displayName: name, about } })); onBack(); }
    catch (e) { Alert.alert("Couldn't save", e.message); }
    setBusy(false);
  };
  return (
    <View style={[s.fill, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10}><Text style={s.back}>Back</Text></Pressable>
        <Text style={s.title}>Profile</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={pick} style={{ alignItems: "center", gap: 10 }}>
          <Avatar name={me.displayName} uri={me.avatar} size={120} />
          <Text style={{ color: C.accent, fontWeight: "600" }}>Change photo</Text>
        </Pressable>
        <View><Text style={s.label}>Name</Text><TextInput style={s.input} value={name} onChangeText={setName} maxLength={40} /></View>
        <View><Text style={s.label}>About</Text><TextInput style={s.input} value={about} onChangeText={setAbout} maxLength={140} /></View>
        <Text style={{ color: C.sub, marginLeft: 4 }}>@{me.username}</Text>
        <GradButton title="Save" onPress={save} busy={busy} />
        <View style={{ height: 1, backgroundColor: C.line, marginVertical: 8 }} />
        <Text style={s.label}>App lock (asks for your PIN after 30 seconds away)</Text>
        {hasPin
          ? <GradButton title="Remove PIN" colors={[C.raised, C.raised]} onPress={onRemovePin} />
          : <GradButton title="Set a PIN" colors={[C.raised, C.raised]} onPress={onSetPin} />}
        <Pressable onPress={onLogout} style={{ alignSelf: "center", padding: 12 }}><Text style={{ color: C.danger, fontWeight: "600" }}>Sign out</Text></Pressable>
      </ScrollView>
    </View>
  );
}

/* ---------------- Root ---------------- */
function Root() {
  const [boot, setBoot] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState({});
  const [blocked, setBlocked] = useState([]);
  const [screen, setScreen] = useState({ name: "chats" });
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pinSetup, setPinSetup] = useState(false);
  const subs = useRef(new Set());
  const bus = useRef({ sub: (fn) => { subs.current.add(fn); return () => subs.current.delete(fn); } }).current;
  const callRef = useRef(null);
  const hasPinRef = useRef(false);
  const bgAt = useRef(0);

  const refresh = useCallback(() => api("/chats").then(setChats).catch(() => {}), []);
  const me = session ? { ...session.user, ...profile } : null;

  useEffect(() => {
    (async () => {
      const v = await AsyncStorage.getItem("session");
      if (v) { const s0 = JSON.parse(v); setToken(s0.token); setSession(s0); }
      const pin = await getPin();
      hasPinRef.current = !!pin; setHasPin(!!pin); if (pin) setLocked(true);
      setBoot(false);
    })();
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "background") bgAt.current = Date.now();
      else if (st === "active" && hasPinRef.current && bgAt.current && Date.now() - bgAt.current > 30000) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true); refresh().finally(() => setLoading(false));
    api("/me").then(({ blocked: b, ...rest }) => { setBlocked(b); setProfile(rest); }).catch(() => {});
    registerPush();
    const sock = connectSocket();
    ["message", "update", "read", "typing", "presence"].forEach((ev) => sock.on(ev, (d) => subs.current.forEach((f) => f(ev, d))));
    sock.on("message", refresh); sock.on("update", refresh); sock.on("chats:changed", refresh); sock.on("connect", refresh);
    setSocket(sock);
    return () => sock.disconnect();
  }, [session]);

  const authed = async (data) => { setToken(data.token); await AsyncStorage.setItem("session", JSON.stringify(data)); setSession(data); };
  const logout = async () => {
    await AsyncStorage.removeItem("session"); setToken(null); setSession(null); setProfile({}); setChats([]); setSocket(null); setScreen({ name: "chats" });
  };
  const toggleBlock = async (id, isBlocked) => {
    try {
      await api("/block/" + id, { method: isBlocked ? "DELETE" : "POST" });
      setBlocked((b) => (isBlocked ? b.filter((x) => x !== id) : [...b, id]));
    } catch (e) { Alert.alert("Failed", e.message); }
  };
  const open = (chat) => setScreen({ name: "chat", chat });
  const home = () => { refresh(); setScreen({ name: "chats" }); };

  if (boot) return <View style={s.fill} />;
  if (session && locked) return <LockScreen onUnlock={() => setLocked(false)} />;
  if (!session) return <Auth onAuthed={authed} />;
  if (pinSetup) return <PinSetup onCancel={() => setPinSetup(false)} onDone={() => { hasPinRef.current = true; setHasPin(true); setPinSetup(false); }} />;

  let content;
  if (screen.name === "chat" && socket)
    content = <Conversation key={screen.chat.kind + screen.chat.id} me={me} chat={screen.chat} socket={socket} bus={bus} blocked={blocked} onToggleBlock={toggleBlock}
      onCall={(c, video) => callRef.current && callRef.current.start({ id: c.id, displayName: c.name, avatar: c.avatar }, video)} onBack={home} />;
  else if (screen.name === "search") content = <Search mode="dm" onBack={home} onOpen={open} />;
  else if (screen.name === "group") content = <Search mode="group" onBack={home} onCreated={(g) => { refresh(); open({ kind: "group", id: g.id, name: g.name, members: g.members }); }} />;
  else if (screen.name === "profile")
    content = <Profile me={me} hasPin={hasPin} onBack={home} onUpdate={(p) => setProfile((x) => ({ ...x, ...p }))} onSetPin={() => setPinSetup(true)}
      onRemovePin={async () => { await clearPin(); hasPinRef.current = false; setHasPin(false); }} onLogout={logout} />;
  else content = <Chats me={me} chats={chats} loading={loading} onOpen={open} onNew={() => setScreen({ name: "search" })} onGroup={() => setScreen({ name: "group" })} onProfile={() => setScreen({ name: "profile" })} />;

  return <>{content}{socket && <CallManager ref={callRef} socket={socket} />}</>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Root />
    </SafeAreaProvider>
  );
}
