const fs = require("fs");
const hasGoogle = fs.existsSync(__dirname + "/google-services.json");

module.exports = {
  expo: {
    name: "Pulse",
    slug: "pulse-chat",
    version: "1.1.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    backgroundColor: "#0E1020",
    android: {
      package: "com.pulse.chat",
      softwareKeyboardLayoutMode: "resize",
      permissions: ["CAMERA", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "POST_NOTIFICATIONS"],
      ...(hasGoogle ? { googleServicesFile: "./google-services.json" } : {}),
    },
    ios: {
      bundleIdentifier: "com.pulse.chat",
      infoPlist: { NSCameraUsageDescription: "Used for video calls and sending photos.", NSMicrophoneUsageDescription: "Used for calls." },
    },
    plugins: [
      "expo-secure-store",
      "expo-notifications",
      ["expo-build-properties", { android: { usesCleartextTraffic: true, minSdkVersion: 24 } }],
      ["@config-plugins/react-native-webrtc", { cameraPermission: "Allow Pulse to use the camera for video calls", microphonePermission: "Allow Pulse to use the microphone for calls" }],
    ],
  },
};
