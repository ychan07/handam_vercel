const admin = require("firebase-admin");

let app;

function getFirebaseAdmin() {
  if (app) return admin;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT 환경 변수가 필요합니다.");
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (_error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT JSON 형식이 올바르지 않습니다.");
  }

  app = admin.initializeApp({
    credential: admin.credential.cert(credentials),
  });

  return admin;
}

function getAuth() {
  return getFirebaseAdmin().auth();
}

function getFirestore() {
  return getFirebaseAdmin().firestore();
}

function hasFirebaseAdmin() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

module.exports = { getFirebaseAdmin, getAuth, getFirestore, hasFirebaseAdmin };
