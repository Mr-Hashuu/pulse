# Pulse v1.1

## 1. Backend
backend/config.js has your MongoDB string. Deploy `backend/` (Render/Railway, Dockerfile included).
Atlas -> Network Access -> allow 0.0.0.0/0.

## 2. App
Put the deployed https URL into mobile/src/config.js (SERVER_URL).
Push to a PRIVATE GitHub repo -> Actions -> "Build Android APK" -> Run workflow -> download pulse-apk.

## 3. Push notifications (optional, needs Firebase, free)
1. console.firebase.google.com -> new project -> add Android app, package `com.pulse.chat`
   -> download google-services.json.
2. GitHub repo secret `GOOGLE_SERVICES_JSON_BASE64` = base64 of that file
   (Linux/Mac: `base64 -w0 google-services.json`).
3. Firebase -> Project settings -> Service accounts -> Generate new private key.
   Backend env var `FIREBASE_SERVICE_ACCOUNT` = the whole JSON (or save as backend/firebase-service-account.json).
Without these, everything else still works; you just get no notifications.

## Calls
Voice/video use WebRTC with Google STUN. Add a TURN server in mobile/src/Call.js (ICE) for calls over mobile data.
Calls ring only while the app is open.
