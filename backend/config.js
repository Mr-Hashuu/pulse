// Server-side only. Never copy these into the mobile app.
let FIREBASE_SA = null; // push notifications (optional)
try {
  FIREBASE_SA = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require("./firebase-service-account.json");
} catch (e) {}

module.exports = {
  FIREBASE_SA,
  PORT: process.env.PORT || 4000,
  MONGO_URI:
    process.env.MONGO_URI ||
    "mongodb+srv://verifycenter6_db_user:IGKkrBnwz2hZ81GX@cluster0.uy4ci6b.mongodb.net/pulse?retryWrites=true&w=majority&appName=Cluster0",
  JWT_SECRET: process.env.JWT_SECRET || "0a8ccfba31957f60e59327e9765a3efbecfe3e3ca155caec5efeeb07c257c0f8",
};
