const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Server } = require("socket.io");
const { PORT, MONGO_URI, JWT_SECRET, FIREBASE_SA } = require("./config");

const OID = mongoose.Schema.Types.ObjectId;
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 24 },
  displayName: String,
  passHash: String,
  about: { type: String, default: "Hey, I'm using Pulse" },
  avatar: String,
  lastSeen: Date,
  blocked: [{ type: OID }],
  pushTokens: [String],
}, { timestamps: true }));

const Group = mongoose.model("Group", new mongoose.Schema({
  name: String,
  admin: OID,
  members: [{ type: OID, index: true }],
}, { timestamps: true }));

const Message = mongoose.model("Message", new mongoose.Schema({
  from: { type: OID, index: true },
  to: { type: OID, index: true },
  group: { type: OID, index: true },
  text: String,
  mediaUrl: String,
  mediaType: String,
  replyTo: OID,
  deleted: { type: Boolean, default: false },
  reactions: [{ _id: false, uid: String, emoji: String }],
  deliveredAt: Date,
  readAt: Date,
}, { timestamps: true }));

let admin = null;
if (FIREBASE_SA) {
  try { admin = require("firebase-admin"); admin.initializeApp({ credential: admin.credential.cert(FIREBASE_SA) }); console.log("Push notifications on"); }
  catch (e) { console.log("Push disabled:", e.message); admin = null; }
}

const app = express();
app.use(cors());
app.use(express.json());
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, f, cb) => cb(null, Date.now() + "-" + Math.random().toString(36).slice(2) + path.extname(f.originalname || ".jpg")),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const sign = (u) => jwt.sign({ id: u._id }, JWT_SECRET, { expiresIn: "60d" });
const pub = (u) => ({ id: u._id, username: u.username, displayName: u.displayName, about: u.about, avatar: u.avatar });
const auth = (req, res, next) => {
  try { req.uid = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), JWT_SECRET).id; next(); }
  catch { res.status(401).json({ error: "Please sign in again" }); }
};
const has = (arr, id) => (arr || []).some((x) => String(x) === String(id));

/* ---------- auth + profile ---------- */
app.post("/auth/register", async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || username.length < 3 || !password || password.length < 6)
    return res.status(400).json({ error: "Username 3+ chars, password 6+ chars" });
  try {
    const u = await User.create({ username, displayName: displayName || username, passHash: await bcrypt.hash(password, 10) });
    res.json({ token: sign(u), user: pub(u) });
  } catch { res.status(409).json({ error: "That username is taken" }); }
});
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const u = await User.findOne({ username: (username || "").toLowerCase().trim() });
  if (!u || !(await bcrypt.compare(password || "", u.passHash))) return res.status(401).json({ error: "Wrong username or password" });
  res.json({ token: sign(u), user: pub(u) });
});
app.get("/me", auth, async (req, res) => {
  const u = await User.findById(req.uid);
  res.json({ ...pub(u), blocked: u.blocked.map(String) });
});
app.put("/me", auth, async (req, res) => {
  const { displayName, about } = req.body || {};
  const u = await User.findByIdAndUpdate(req.uid, {
    ...(displayName && { displayName: String(displayName).slice(0, 40) }),
    ...(about !== undefined && { about: String(about).slice(0, 140) }),
  }, { new: true });
  res.json(pub(u));
});
app.post("/me/avatar", auth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const u = await User.findByIdAndUpdate(req.uid, { avatar: "/uploads/" + req.file.filename }, { new: true });
  res.json(pub(u));
});
app.post("/me/push", auth, async (req, res) => {
  if (req.body && req.body.token) await User.updateOne({ _id: req.uid }, { $addToSet: { pushTokens: req.body.token } });
  res.json({ ok: true });
});
app.post("/block/:id", auth, async (req, res) => { await User.updateOne({ _id: req.uid }, { $addToSet: { blocked: req.params.id } }); res.json({ ok: true }); });
app.delete("/block/:id", auth, async (req, res) => { await User.updateOne({ _id: req.uid }, { $pull: { blocked: req.params.id } }); res.json({ ok: true }); });

app.get("/users", auth, async (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  if (q.length < 2) return res.json([]);
  const me = await User.findById(req.uid);
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const list = await User.find({ username: new RegExp("^" + safe), _id: { $ne: req.uid, $nin: me.blocked } }).limit(20);
  res.json(list.map(pub));
});

/* ---------- groups ---------- */
app.post("/groups", auth, async (req, res) => {
  const { name, members } = req.body || {};
  if (!name || !Array.isArray(members) || !members.length) return res.status(400).json({ error: "Add a name and at least one member" });
  const ids = [...new Set([req.uid, ...members.map(String)])];
  const g = await Group.create({ name: String(name).slice(0, 40), admin: req.uid, members: ids });
  ids.forEach((id) => io.to(id).emit("chats:changed"));
  res.json({ id: g._id, name: g.name, members: ids.length });
});
app.get("/groups/:id", auth, async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g || !has(g.members, req.uid)) return res.status(404).json({ error: "Group not found" });
  const users = await User.find({ _id: { $in: g.members } });
  res.json({ id: g._id, name: g.name, admin: g.admin, members: users.map(pub) });
});

/* ---------- chats + history ---------- */
app.get("/chats", auth, async (req, res) => {
  const me = new mongoose.Types.ObjectId(req.uid);
  const noGroup = { group: { $exists: false } };
  const rows = await Message.aggregate([
    { $match: { $and: [{ $or: [{ from: me }, { to: me }] }, noGroup] } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: { $cond: [{ $eq: ["$from", me] }, "$to", "$from"] }, last: { $first: "$$ROOT" } } },
  ]);
  const unread = await Message.aggregate([
    { $match: { to: me, readAt: null, deleted: false, ...noGroup } },
    { $group: { _id: "$from", n: { $sum: 1 } } },
  ]);
  const un = Object.fromEntries(unread.map((r) => [String(r._id), r.n]));
  const users = await User.find({ _id: { $in: rows.map((r) => r._id) } });
  const byId = Object.fromEntries(users.map((u) => [String(u._id), pub(u)]));
  const items = rows.filter((r) => byId[String(r._id)]).map((r) => ({ kind: "user", peer: byId[String(r._id)], last: r.last, unread: un[String(r._id)] || 0, at: r.last.createdAt }));
  const groups = await Group.find({ members: req.uid });
  for (const g of groups) {
    const last = await Message.findOne({ group: g._id }).sort({ createdAt: -1 });
    items.push({ kind: "group", group: { id: g._id, name: g.name, members: g.members.length }, last, unread: 0, at: last ? last.createdAt : g.createdAt });
  }
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json(items);
});
app.get("/messages/:peer", auth, async (req, res) => {
  const { uid } = req, peer = req.params.peer;
  const since = req.query.since ? new Date(req.query.since) : new Date(0);
  res.json(await Message.find({
    $and: [{ $or: [{ from: uid, to: peer }, { from: peer, to: uid }] }, { group: { $exists: false } }],
    updatedAt: { $gt: since },
  }).sort({ createdAt: 1 }).limit(500));
});
app.get("/groupmsgs/:id", auth, async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g || !has(g.members, req.uid)) return res.status(404).json({ error: "Group not found" });
  const since = req.query.since ? new Date(req.query.since) : new Date(0);
  res.json(await Message.find({ group: g._id, updatedAt: { $gt: since } }).sort({ createdAt: 1 }).limit(500));
});
app.post("/upload", auth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({ url: "/uploads/" + req.file.filename, type: (req.file.mimetype || "").startsWith("image") ? "image" : "file" });
});

/* ---------- realtime ---------- */
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e6 });
const online = new Map(); // uid -> open socket count

io.use((socket, next) => {
  try { socket.uid = String(jwt.verify(socket.handshake.auth.token, JWT_SECRET).id); next(); }
  catch { next(new Error("unauthorized")); }
});

async function audience(m) {
  if (m.group) { const g = await Group.findById(m.group); return g ? g.members.map(String) : []; }
  return [String(m.from), String(m.to)];
}
async function emitAll(m, ev) { (await audience(m)).forEach((id) => io.to(id).emit(ev, m)); }

async function push(users, sender, m, groupName) {
  if (!admin) return;
  const body = m.mediaUrl ? "Photo" : (m.text || "").slice(0, 120);
  const title = groupName ? `${sender.displayName} in ${groupName}` : sender.displayName;
  for (const u of users) for (const token of u.pushTokens || []) {
    admin.messaging().send({ token, notification: { title, body }, android: { priority: "high" } })
      .catch((e) => { if (/not-registered|invalid/.test(e.code || "")) User.updateOne({ _id: u._id }, { $pull: { pushTokens: token } }).exec(); });
  }
}

io.on("connection", async (socket) => {
  const uid = socket.uid;
  socket.join(uid);
  online.set(uid, (online.get(uid) || 0) + 1);
  if (online.get(uid) === 1) io.emit("presence", { uid, online: true });

  // anything sent while I was offline is now delivered
  const pending = await Message.find({ to: uid, deliveredAt: null, group: { $exists: false } });
  if (pending.length) {
    await Message.updateMany({ _id: { $in: pending.map((m) => m._id) } }, { deliveredAt: new Date() });
    for (const m of await Message.find({ _id: { $in: pending.map((m) => m._id) } })) io.to(String(m.from)).emit("update", m);
  }

  socket.on("message", async (data, ack) => {
    ack = typeof ack === "function" ? ack : () => {};
    try {
      const { to, group, text, mediaUrl, mediaType, replyTo } = data || {};
      if ((!to && !group) || (!text && !mediaUrl)) return ack({ error: "Empty message" });
      const sender = await User.findById(uid);
      const base = { from: uid, text: (text || "").slice(0, 4000), mediaUrl, mediaType, replyTo: replyTo || undefined };
      let m;
      if (group) {
        const g = await Group.findById(group);
        if (!g || !has(g.members, uid)) return ack({ error: "You're not in this group" });
        m = await Message.create({ ...base, group });
        const others = g.members.map(String).filter((id) => id !== uid);
        others.forEach((id) => io.to(id).emit("message", m));
        push(await User.find({ _id: { $in: others.filter((id) => !online.has(id)) } }), sender, m, g.name);
      } else {
        const peer = await User.findById(to);
        if (!peer) return ack({ error: "User not found" });
        if (has(sender.blocked, to)) return ack({ error: "Unblock this person to send messages" });
        const blockedByPeer = has(peer.blocked, uid); // silently dropped, like WhatsApp
        m = new Message({ ...base, to, deliveredAt: !blockedByPeer && online.has(to) ? new Date() : undefined });
        await m.save();
        if (!blockedByPeer) {
          io.to(to).emit("message", m);
          if (!online.has(to)) push([peer], sender, m);
        }
      }
      ack({ ok: true, message: m });
    } catch (e) { ack({ error: "Could not send" }); }
  });

  socket.on("read", async ({ peer }) => {
    const at = new Date();
    const r = await Message.updateMany({ from: peer, to: uid, readAt: null, group: { $exists: false } }, { readAt: at, deliveredAt: at });
    if (r.modifiedCount) io.to(String(peer)).emit("read", { by: uid, at });
  });

  socket.on("delete", async ({ id }) => {
    const m = await Message.findById(id);
    if (!m || String(m.from) !== uid) return;
    m.deleted = true; m.text = ""; m.mediaUrl = undefined; m.reactions = [];
    await m.save(); emitAll(m, "update");
  });

  socket.on("react", async ({ id, emoji }) => {
    const m = await Message.findById(id);
    if (!m || m.deleted || !(await audience(m)).includes(uid)) return;
    const mine = m.reactions.find((r) => r.uid === uid);
    m.reactions = m.reactions.filter((r) => r.uid !== uid);
    if (!mine || mine.emoji !== emoji) m.reactions.push({ uid, emoji });
    await m.save(); emitAll(m, "update");
  });

  socket.on("typing", async ({ to, group }) => {
    if (group) { const g = await Group.findById(group); (g ? g.members.map(String) : []).filter((x) => x !== uid).forEach((x) => io.to(x).emit("typing", { from: uid, group })); }
    else if (to) io.to(String(to)).emit("typing", { from: uid });
  });

  socket.on("presence:get", async ({ id }, ack) => {
    if (typeof ack !== "function") return;
    const u = await User.findById(id).select("lastSeen");
    ack({ online: online.has(String(id)), lastSeen: u && u.lastSeen });
  });

  // WebRTC signalling (voice/video calls)
  socket.on("call:offer", async (d) => {
    if (!d || !d.to) return;
    if (!online.has(String(d.to))) return socket.emit("call:unavailable");
    const me = await User.findById(uid);
    io.to(String(d.to)).emit("call:offer", { ...d, from: uid, caller: pub(me) });
  });
  for (const ev of ["call:answer", "call:ice", "call:end", "call:reject"])
    socket.on(ev, (d) => { if (d && d.to) io.to(String(d.to)).emit(ev, { ...d, from: uid }); });

  socket.on("disconnect", async () => {
    const n = (online.get(uid) || 1) - 1;
    if (n > 0) return online.set(uid, n);
    online.delete(uid);
    const lastSeen = new Date();
    await User.updateOne({ _id: uid }, { lastSeen });
    io.emit("presence", { uid, online: false, lastSeen });
  });
});

mongoose.connect(MONGO_URI)
  .then(() => { console.log("MongoDB connected"); server.listen(PORT, () => console.log("Pulse server on " + PORT)); })
  .catch((e) => { console.error("MongoDB error:", e.message); process.exit(1); });
