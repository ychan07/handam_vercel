const fs = require("fs");
const path = require("path");
const { crypto } = require("./_lib");
const { getAuth, getFirestore, hasFirebaseAdmin } = require("./_firebaseAdmin");

const CONFIG_PATH = path.join(__dirname, "data", "admin-config.json");
const PRESENCE_COLLECTION = "handam_presence";
const ADMIN_DOC = "handam_admin/config";
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

function jwtSecret() {
  return process.env.ADMIN_JWT_SECRET || "handam-dev-admin-secret-change-me";
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(test, "hex"), Buffer.from(hash, "hex"));
}

function signAdminToken(payload = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      role: "admin",
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", jwtSecret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto.createHmac("sha256", jwtSecret()).update(`${header}.${body}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.role !== "admin") return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

function defaultConfig() {
  const { salt, hash } = hashPassword(process.env.ADMIN_PASSWORD || "admin");
  return {
    username: process.env.ADMIN_USERNAME || "admin",
    salt,
    passwordHash: hash,
    updatedAt: new Date().toISOString(),
  };
}

function readLocalConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (_error) {
    return null;
  }
}

function writeLocalConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function isValidConfig(config) {
  return Boolean(config?.username && config?.salt && config?.passwordHash && config.passwordHash !== "placeholder");
}

async function loadAdminConfig() {
  if (hasFirebaseAdmin()) {
    try {
      const snap = await getFirestore().doc(ADMIN_DOC).get();
      if (snap.exists && isValidConfig(snap.data())) return snap.data();
    } catch (_error) {}
  }
  const local = readLocalConfig();
  if (isValidConfig(local)) return local;
  const defaults = defaultConfig();
  writeLocalConfig(defaults);
  return defaults;
}

async function saveAdminConfig(config) {
  const next = { ...config, updatedAt: new Date().toISOString() };
  if (hasFirebaseAdmin()) {
    await getFirestore().doc(ADMIN_DOC).set(next, { merge: true });
  }
  writeLocalConfig(next);
  return next;
}

async function validateAdminLogin(username, password) {
  const config = await loadAdminConfig();
  if (username !== config.username) return false;
  return verifyPassword(password, config.salt, config.passwordHash);
}

async function adminLogin(username, password) {
  const ok = await validateAdminLogin(username, password);
  if (!ok) throw new Error("관리자 아이디 또는 비밀번호가 올바르지 않습니다.");
  return { token: signAdminToken({ sub: username }), username };
}

async function changeAdminCredentials(adminToken, currentPassword, newUsername, newPassword) {
  const session = verifyAdminToken(adminToken);
  if (!session) throw new Error("관리자 세션이 만료되었습니다.");
  const config = await loadAdminConfig();
  if (!verifyPassword(currentPassword, config.salt, config.passwordHash)) {
    throw new Error("현재 관리자 비밀번호가 일치하지 않습니다.");
  }
  const username = (newUsername || config.username).trim();
  const password = newPassword || currentPassword;
  if (!username) throw new Error("관리자 아이디를 입력해주세요.");
  if (password.length < 4) throw new Error("비밀번호는 4자 이상이어야 합니다.");
  const { salt, hash } = hashPassword(password);
  const next = { username, salt, passwordHash: hash };
  await saveAdminConfig(next);
  return { username, token: signAdminToken({ sub: username }) };
}

async function listFirebaseUsers() {
  if (!hasFirebaseAdmin()) return [];
  const auth = getAuth();
  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function getPresenceMap() {
  if (!hasFirebaseAdmin()) return {};
  const snap = await getFirestore().collection(PRESENCE_COLLECTION).get();
  const map = {};
  snap.forEach((doc) => {
    map[doc.id] = doc.data();
  });
  return map;
}

async function touchPresence(uid, payload = {}) {
  if (!hasFirebaseAdmin() || !uid) return;
  await getFirestore()
    .collection(PRESENCE_COLLECTION)
    .doc(uid)
    .set(
      {
        uid,
        lastSeen: new Date().toISOString(),
        ...payload,
      },
      { merge: true }
    );
}

async function getAdminStats() {
  const users = await listFirebaseUsers();
  const presence = await getPresenceMap();
  const now = Date.now();
  let activeCount = 0;
  for (const user of users) {
    const seen = presence[user.uid]?.lastSeen;
    if (seen && now - new Date(seen).getTime() <= ACTIVE_WINDOW_MS) activeCount += 1;
  }
  return {
    totalUsers: users.length,
    activeUsers: activeCount,
    activeWindowMinutes: ACTIVE_WINDOW_MS / 60000,
    firebaseConfigured: hasFirebaseAdmin(),
  };
}

async function getAdminUsers() {
  const users = await listFirebaseUsers();
  const presence = await getPresenceMap();
  const now = Date.now();
  return users.map((user) => {
    const seen = presence[user.uid]?.lastSeen;
    const active = seen && now - new Date(seen).getTime() <= ACTIVE_WINDOW_MS;
    return {
      uid: user.uid,
      email: user.email || null,
      phone: user.phoneNumber || presence[user.uid]?.phone || null,
      displayName: user.displayName || presence[user.uid]?.displayName || null,
      disabled: user.disabled,
      createdAt: user.metadata.creationTime,
      lastSignIn: user.metadata.lastSignInTime,
      lastSeen: seen || null,
      active,
      providers: (user.providerData || []).map((p) => p.providerId),
    };
  });
}

async function resetUserPassword(uid, newPassword) {
  if (!hasFirebaseAdmin()) throw new Error("FIREBASE_SERVICE_ACCOUNT가 설정되지 않았습니다.");
  if (!uid || !newPassword || newPassword.length < 6) {
    throw new Error("uid와 6자 이상의 새 비밀번호가 필요합니다.");
  }
  await getAuth().updateUser(uid, { password: newPassword });
  return { ok: true, uid };
}

module.exports = {
  verifyAdminToken,
  adminLogin,
  changeAdminCredentials,
  getAdminStats,
  getAdminUsers,
  resetUserPassword,
  touchPresence,
  hasFirebaseAdmin,
  loadAdminConfig,
};
