import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Modal, PermissionsAndroid, Platform, Pressable, Text, View, Alert } from "react-native";
import { RTCPeerConnection, RTCView, RTCSessionDescription, RTCIceCandidate, mediaDevices } from "react-native-webrtc";
import { C } from "./theme";
import { Avatar, s } from "./ui";

// STUN works on most home/Wi-Fi networks. Add a TURN server here for reliable calls over mobile data.
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

const CallManager = forwardRef(function CallManager({ socket }, ref) {
  const [phase, setPhase] = useState("idle"); // idle | calling | ringing | connecting | connected
  const [peer, setPeer] = useState(null);
  const [video, setVideo] = useState(false);
  const [local, setLocal] = useState(null);
  const [remote, setRemote] = useState(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const pc = useRef(null), stream = useRef(null), peerRef = useRef(null), offer = useRef(null), ice = useRef([]);

  const cleanup = useCallback(() => {
    try { stream.current && stream.current.getTracks().forEach((t) => t.stop()); } catch {}
    try { pc.current && pc.current.close(); } catch {}
    pc.current = null; stream.current = null; offer.current = null; ice.current = []; peerRef.current = null;
    setLocal(null); setRemote(null); setPeer(null); setMuted(false); setCamOff(false); setPhase("idle");
  }, []);

  const setup = async (withVideo) => {
    if (Platform.OS === "android") {
      const need = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, ...(withVideo ? [PermissionsAndroid.PERMISSIONS.CAMERA] : [])];
      const r = await PermissionsAndroid.requestMultiple(need);
      if (Object.values(r).some((x) => x !== "granted")) throw new Error("Allow microphone/camera access to make calls.");
    }
    const st = await mediaDevices.getUserMedia({ audio: true, video: withVideo ? { facingMode: "user" } : false });
    stream.current = st; setLocal(st);
    const p = new RTCPeerConnection(ICE);
    st.getTracks().forEach((t) => p.addTrack(t, st));
    p.onicecandidate = (e) => { if (e.candidate && peerRef.current) socket.emit("call:ice", { to: peerRef.current.id, candidate: e.candidate }); };
    p.ontrack = (e) => setRemote(e.streams[0]);
    p.onconnectionstatechange = () => {
      if (p.connectionState === "connected") setPhase("connected");
      if (p.connectionState === "failed" || p.connectionState === "closed") cleanup();
    };
    pc.current = p;
  };

  const flushIce = async () => { for (const c of ice.current) await pc.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}); ice.current = []; };

  const start = async (p, withVideo) => {
    if (phase !== "idle") return;
    try {
      peerRef.current = p; setPeer(p); setVideo(withVideo); setPhase("calling");
      await setup(withVideo);
      const o = await pc.current.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: withVideo });
      await pc.current.setLocalDescription(o);
      socket.emit("call:offer", { to: p.id, sdp: o, video: withVideo });
    } catch (e) { cleanup(); Alert.alert("Can't start call", e.message); }
  };

  const accept = async () => {
    try {
      setPhase("connecting");
      await setup(video);
      await pc.current.setRemoteDescription(new RTCSessionDescription(offer.current));
      await flushIce();
      const a = await pc.current.createAnswer();
      await pc.current.setLocalDescription(a);
      socket.emit("call:answer", { to: peerRef.current.id, sdp: a });
    } catch (e) { socket.emit("call:end", { to: peerRef.current && peerRef.current.id }); cleanup(); Alert.alert("Call failed", e.message); }
  };

  const reject = () => { socket.emit("call:reject", { to: peerRef.current.id }); cleanup(); };
  const hangup = () => { if (peerRef.current) socket.emit("call:end", { to: peerRef.current.id }); cleanup(); };

  useImperativeHandle(ref, () => ({ start }));

  useEffect(() => {
    const onOffer = (d) => {
      if (pc.current || peerRef.current) return socket.emit("call:reject", { to: d.from });
      peerRef.current = d.caller; offer.current = d.sdp; setPeer(d.caller); setVideo(!!d.video); setPhase("ringing");
    };
    const onAnswer = async (d) => { if (pc.current) { await pc.current.setRemoteDescription(new RTCSessionDescription(d.sdp)); await flushIce(); setPhase("connecting"); } };
    const onIce = async (d) => {
      if (pc.current && pc.current.remoteDescription) await pc.current.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(() => {});
      else ice.current.push(d.candidate);
    };
    const onUnavailable = () => { cleanup(); Alert.alert("Not available", "They're offline right now."); };
    socket.on("call:offer", onOffer); socket.on("call:answer", onAnswer); socket.on("call:ice", onIce);
    socket.on("call:end", cleanup); socket.on("call:reject", cleanup); socket.on("call:unavailable", onUnavailable);
    return () => {
      socket.off("call:offer", onOffer); socket.off("call:answer", onAnswer); socket.off("call:ice", onIce);
      socket.off("call:end", cleanup); socket.off("call:reject", cleanup); socket.off("call:unavailable", onUnavailable);
    };
  }, [socket]);

  const toggleMute = () => { stream.current.getAudioTracks().forEach((t) => (t.enabled = muted)); setMuted(!muted); };
  const toggleCam = () => { stream.current.getVideoTracks().forEach((t) => (t.enabled = camOff)); setCamOff(!camOff); };

  if (phase === "idle") return null;
  const status = { calling: "Calling…", ringing: video ? "Incoming video call" : "Incoming voice call", connecting: "Connecting…", connected: "Connected" }[phase];
  const Round = ({ label, onPress, bg = C.raised }) => (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 6 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontSize: 26 }}>{label.icon}</Text>
      </View>
      <Text style={{ color: C.sub, fontSize: 12 }}>{label.text}</Text>
    </Pressable>
  );
  return (
    <Modal visible animationType="slide" onRequestClose={hangup}>
      <View style={[s.fill, { alignItems: "center", justifyContent: "space-between", paddingVertical: 70 }]}>
        {video && remote && <RTCView streamURL={remote.toURL()} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} objectFit="cover" />}
        {video && local && !camOff && <RTCView streamURL={local.toURL()} mirror style={{ position: "absolute", top: 60, right: 16, width: 110, height: 150, borderRadius: 14, overflow: "hidden", zIndex: 2 }} objectFit="cover" />}
        <View style={{ alignItems: "center", gap: 12 }}>
          {!(video && remote) && <Avatar name={peer && peer.displayName} uri={peer && peer.avatar} size={110} />}
          <Text style={[s.title, { textShadowColor: "#000", textShadowRadius: 6 }]}>{peer && peer.displayName}</Text>
          <Text style={{ color: C.sub, textShadowColor: "#000", textShadowRadius: 6 }}>{status}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 28 }}>
          {phase === "ringing" ? (
            <>
              <Round label={{ icon: "✕", text: "Decline" }} bg={C.danger} onPress={reject} />
              <Round label={{ icon: "✓", text: "Accept" }} bg="#2ECC8F" onPress={accept} />
            </>
          ) : (
            <>
              {phase !== "calling" && <Round label={{ icon: muted ? "🔇" : "🎤", text: muted ? "Unmute" : "Mute" }} onPress={toggleMute} />}
              {video && phase !== "calling" && <Round label={{ icon: camOff ? "🚫" : "📷", text: camOff ? "Camera on" : "Camera off" }} onPress={toggleCam} />}
              <Round label={{ icon: "✕", text: "End" }} bg={C.danger} onPress={hangup} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
});
export default CallManager;
