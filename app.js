import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { initInteractions, refreshInteractions } from "./interactions.js";
import { initElasticSegments, refreshElasticSegments } from "./segment-control.js";
import { animatePromptRefresh } from "./prompt-animations.js";
import { getWeekStart, getWeekStripDates, shiftWeek } from "./week-calendar.js";
import { calculateCurrentStreak, calculateDiaryStats } from "./diary-stats.js";
import {
  deepMerge,
  DEFAULT_ANIMATIONS,
  getAnimations,
  loadAnimations,
  parseJsonWithComments,
} from "./animations.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA9B9AuVV679_hy5wVLKjmIaTLb9Ly9G9U",
  authDomain: "handam-981b6.firebaseapp.com",
  projectId: "handam-981b6",
  storageBucket: "handam-981b6.firebasestorage.app",
  messagingSenderId: "805379521540",
  appId: "1:805379521540:web:65febd097008274cf44951",
  measurementId: "G-9MYZL9G70Y",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
auth.languageCode = "ko";
analyticsSupported()
  .then((supported) => {
    if (supported) getAnalytics(firebaseApp);
  })
  .catch(() => {});

const state = {
  selectedRecordId: null,
  records: [],
  auth: null,
  profile: null,
  admin: null,
  fortuneBirthday: null,
  fortune: null,
  selectedPrompt: "",
  weekStatsReference: null,
  recordDetailReturnPage: "records",
  settings: null,
  recordsSource: "none",
  trackerMonth: null,
  reportMode: "month",
  reportKey: "",
  ocrFile: null,
  fortuneOpened: false,
};
const googleProvider = new GoogleAuthProvider();
const AUTH_PAGES = new Set(["login", "signup", "find-account", "admin"]);
const LAST_ACCOUNTS_KEY = "handam-last-accounts";
const PASSWORD_RESET_COOLDOWN_MS = 30_000;
let presenceTimer = null;
let dbWorker, workerSeq = 0;
let cloudLoadUid = null;
let cloudLoadPromise = null;
let pendingSignupProfile = null;
let passwordResetCooldownTimer = null;
let passwordResetCooldownUntil = 0;
let sheetReturnFocus = null;
const workerWaiters = new Map();
const promptRotation = { default: 0 };
let promptByMood = {};
let emotionOptions = [];
let fortuneData = null;
let greetingData = null;

const DEFAULT_USER_SETTINGS = Object.freeze({
  theme: "light",
  recordReminder: true,
  summaryQuality: "고급",
  persona: "따뜻한 공감형",
  lunarCalendar: false,
  fortuneBirthday: "",
});
const LEGACY_MIGRATION_MARKER = "handam-legacy-migrated-to-uid";

function normalizeUserSettings(settings = {}) {
  const theme = settings.theme === "dark" ? "dark" : "light";
  const summaryQuality = ["표준", "고급", "최고"].includes(settings.summaryQuality)
    ? settings.summaryQuality
    : DEFAULT_USER_SETTINGS.summaryQuality;
  const persona = ["따뜻한 공감형", "담백한 정리형"].includes(settings.persona)
    ? settings.persona
    : DEFAULT_USER_SETTINGS.persona;
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(String(settings.fortuneBirthday || ""))
    ? String(settings.fortuneBirthday)
    : "";
  return {
    theme,
    recordReminder: settings.recordReminder !== false,
    summaryQuality,
    persona,
    lunarCalendar: Boolean(settings.lunarCalendar),
    fortuneBirthday: birthday,
  };
}

function settingsStorageKey(uid) { return `handam-settings-${uid || "guest"}`; }
function recordsCacheKey(uid) { return `handam-records-${uid || "guest"}`; }
function loadCachedSettings(uid) {
  try {
    return normalizeUserSettings(JSON.parse(localStorage.getItem(settingsStorageKey(uid)) || "null") || {});
  } catch (_error) {
    return normalizeUserSettings();
  }
}
function cacheSettings(uid, settings) {
  localStorage.setItem(settingsStorageKey(uid), JSON.stringify(normalizeUserSettings(settings)));
}
function cacheRecords(uid, records) {
  localStorage.setItem(recordsCacheKey(uid), JSON.stringify(records || []));
}
function loadCachedRecords(uid) {
  try {
    const records = JSON.parse(localStorage.getItem(recordsCacheKey(uid)) || "[]");
    return Array.isArray(records) ? records : [];
  } catch (_error) {
    return [];
  }
}
function userDocRef(uid) { return doc(firestore, "users", uid); }
function userDiariesRef(uid) { return collection(firestore, "users", uid, "diaries"); }

function profileStorageKey(uid) { return `handam-profile-${uid || "guest"}`; }
function loadProfile(uid) {
  try { return JSON.parse(localStorage.getItem(profileStorageKey(uid)) || "null"); } catch (_e) { return null; }
}
function saveProfile(uid, patch) {
  const prev = loadProfile(uid) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  localStorage.setItem(profileStorageKey(uid), JSON.stringify(next));
  if (state.auth?.uid === uid) state.profile = next;
  return next;
}
function maskAccountEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (at <= 0) return "";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!domain) return "";
  return `${local.slice(0, 1)}***@${domain}`;
}
function loadLastAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_ACCOUNTS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => typeof entry?.maskedEmail === "string" && entry.maskedEmail.includes("@"))
      .slice(0, 3);
  } catch (_error) {
    return [];
  }
}
function rememberLastAccount(email) {
  const maskedEmail = maskAccountEmail(email);
  if (!maskedEmail) return;
  const next = [
    { maskedEmail, lastUsedAt: new Date().toISOString() },
    ...loadLastAccounts().filter((entry) => entry.maskedEmail !== maskedEmail),
  ].slice(0, 3);
  localStorage.setItem(LAST_ACCOUNTS_KEY, JSON.stringify(next));
}
function firestoreTimestampToIso(value, fallback = new Date().toISOString()) {
  if (value?.toDate) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return fallback;
}
function recordFromFirestore(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    title: String(data.title || "제목 없는 기록"),
    body: String(data.body || ""),
    mood: String(data.mood || ""),
    summary: String(data.summary || ""),
    aiPersona: String(data.aiPersona || ""),
    aiModel: String(data.aiModel || ""),
    summaryQuality: String(data.summaryQuality || ""),
    summaryGenerated: Boolean(data.summaryGenerated),
    createdAt: firestoreTimestampToIso(data.createdAt),
    entryDate: String(data.entryDate || ""),
  };
}
function currentSettings() {
  return normalizeUserSettings(state.settings || DEFAULT_USER_SETTINGS);
}
function applyUserSettings(settings, { applyFortune = true } = {}) {
  const next = normalizeUserSettings(settings);
  state.settings = next;
  applyTheme(next.theme, { save: false });
  document.getElementById("fortune-lunar-switch")?.classList.toggle("on", next.lunarCalendar);
  document.getElementById("fortune-lunar-switch")?.setAttribute("aria-checked", String(next.lunarCalendar));
  document.querySelectorAll("[data-setting-segment]").forEach((segment) => {
    const key = segment.dataset.settingSegment;
    segment.querySelectorAll("button").forEach((button) => {
      const selected = button.dataset.value === String(next[key]);
      button.classList.toggle("on", selected);
      if (button.getAttribute("role") === "radio") {
        button.setAttribute("aria-checked", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
    });
    const selected = segment.querySelector('button[aria-checked="true"]');
    const help = document.getElementById(segment.dataset.settingHelp || "");
    if (selected?.dataset.description && help) help.textContent = selected.dataset.description;
  });
  if (applyFortune) {
    state.fortuneBirthday = next.fortuneBirthday || null;
    refreshFortune();
    syncFortuneOpenedState();
    renderFortuneUI();
    fillBirthdaySelects();
  }
  window.requestAnimationFrame(refreshElasticSegments);
}
async function saveSettingsPatch(patch, { quiet = false } = {}) {
  const next = normalizeUserSettings({ ...currentSettings(), ...(patch || {}) });
  applyUserSettings(next);
  const uid = state.auth?.uid;
  if (!uid || state.auth?.isAdmin) {
    cacheSettings("guest", next);
    return next;
  }
  cacheSettings(uid, next);
  try {
    await setDoc(
      userDocRef(uid),
      {
        uid,
        email: String(state.auth.email || auth.currentUser?.email || ""),
        displayName: String(getDisplayName() || "한담").slice(0, 80),
        settings: next,
        migrationVersion: Number(state.profile?.migrationVersion || 0),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    if (!quiet) showToast("이 기기에 적용했지만 계정에 동기화하지 못했어요. 연결을 확인하고 다시 선택해주세요.");
    throw error;
  }
  return next;
}
async function migrateLegacyDiariesOnce(uid, migrationVersion = 0) {
  if (migrationVersion >= 1) return 1;
  const claimedBy = localStorage.getItem(LEGACY_MIGRATION_MARKER);
  const legacyRecords = claimedBy && claimedBy !== uid ? [] : await callWorker("list");
  const chunks = [];
  const settings = currentSettings();
  for (let i = 0; i < legacyRecords.length; i += 400) chunks.push(legacyRecords.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = writeBatch(firestore);
    for (const record of chunk) {
      const created = new Date(record.createdAt || Date.now());
      const safeCreated = Number.isNaN(created.getTime()) ? new Date() : created;
      batch.set(doc(userDiariesRef(uid), `legacy-${record.id}`), {
        uid,
        title: String(record.title || "제목 없는 기록").slice(0, 200),
        body: String(record.body || "").slice(0, 200000),
        mood: String(record.mood || "평온").slice(0, 50),
        summary: String(record.summary || "").slice(0, 10000),
        aiPersona: settings.persona,
        aiModel: "",
        summaryQuality: settings.summaryQuality,
        summaryGenerated: false,
        entryDate: String(record.entryDate || toDateKey(safeCreated)).slice(0, 10),
        createdAt: Timestamp.fromDate(safeCreated),
        syncedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  await setDoc(userDocRef(uid), { migrationVersion: 1, updatedAt: serverTimestamp() }, { merge: true });
  if (!claimedBy && legacyRecords.length) localStorage.setItem(LEGACY_MIGRATION_MARKER, uid);
  if (state.profile) state.profile.migrationVersion = 1;
  return 1;
}
async function loadCloudUserData(user, profileOverride = null) {
  const uid = user.uid;
  const cached = loadCachedSettings(uid);
  applyUserSettings(cached);
  let userData = {};
  try {
    const snapshot = await getDoc(userDocRef(uid));
    userData = snapshot.exists() ? snapshot.data() : {};
    const settings = normalizeUserSettings({
      ...cached,
      ...(userData.settings || {}),
      fortuneBirthday: userData.settings?.fortuneBirthday || cached.fortuneBirthday || loadFortuneBirthday() || "",
    });
    state.profile = {
      ...(state.profile || {}),
      displayName: profileOverride?.displayName || userData.displayName || user.displayName || state.profile?.displayName || "한담",
      email: profileOverride?.email || userData.email || user.email || state.profile?.email || "",
      migrationVersion: Number(userData.migrationVersion || 0),
    };
    cacheSettings(uid, settings);
    applyUserSettings(settings);
    await setDoc(
      userDocRef(uid),
      {
        uid,
        email: String(user.email || state.profile.email || ""),
        displayName: String(state.profile.displayName || "한담").slice(0, 80),
        settings,
        migrationVersion: Number(userData.migrationVersion || 0),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await migrateLegacyDiariesOnce(uid, Number(userData.migrationVersion || 0));
    await reloadRecords();
  } catch (error) {
    console.error("Firestore 사용자 데이터 로드 실패", error);
    state.records = loadCachedRecords(uid);
    state.recordsSource = "cache";
    renderRecordsUI();
    showToast("클라우드 데이터를 불러오지 못해 이 기기의 캐시를 표시해요.");
  }
  updateUserUI();
}
function getDisplayName() {
  const p = state.profile;
  if (p?.displayName) return p.displayName;
  const user = auth.currentUser;
  if (user?.displayName) return user.displayName;
  const email = state.auth?.email || user?.email || "";
  if (email.includes("@")) return email.split("@")[0];
  return "한담";
}
function getAppPublicUrl() {
  return window.location.origin.replace(/\/$/, "");
}
async function sendPresenceHeartbeat() {
  if (!state.auth?.uid || state.auth.isLocalAdmin || state.auth.isAdmin) return;
  try {
    const user = auth.currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    state.auth.idToken = idToken;
    await apiPost("/api/presence", {
      idToken,
      displayName: getDisplayName(),
    });
  } catch (_e) {}
}
function startPresenceHeartbeat() {
  clearInterval(presenceTimer);
  sendPresenceHeartbeat();
  presenceTimer = setInterval(sendPresenceHeartbeat, 60 * 1000);
}
function stopPresenceHeartbeat() {
  clearInterval(presenceTimer);
  presenceTimer = null;
}
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const GREETING_ICON_BY_EMOJI = {
  "☀️": "sun",
  "🍱": "utensils",
  "🌤️": "cloud-sun",
  "🌆": "city",
  "🌙": "moon",
  "🌌": "moon",
};
const FALLBACK_GREETINGS = [
  { start: 5, end: 11, emoji: "☀️", icon: "sun", messages: ["상쾌한 아침이에요"] },
  { start: 11, end: 14, emoji: "🍱", icon: "utensils", messages: ["좋은 점심이에요"] },
  { start: 14, end: 18, emoji: "🌤️", icon: "cloud-sun", messages: ["따뜻한 오후예요"] },
  { start: 18, end: 22, emoji: "🌆", icon: "city", messages: ["편안한 저녁이에요"] },
  { start: 22, end: 2, wrap: true, emoji: "🌙", icon: "moon", messages: ["선선한 밤이에요"] },
  { start: 2, end: 5, emoji: "🌙", icon: "moon", messages: ["고요한 새벽이에요"] },
];
function greetingSlots() {
  return greetingData?.greetings?.length ? greetingData.greetings : FALLBACK_GREETINGS;
}
function greetingMatchesHour(slot, hour) {
  const start = slot.start ?? 0;
  const end = slot.end ?? 24;
  if (slot.wrap || start > end) return hour >= start || hour < end;
  return hour >= start && hour < end;
}
function getGreetingSlot(hour = new Date().getHours()) {
  const slots = greetingSlots();
  return slots.find((slot) => greetingMatchesHour(slot, hour)) || slots[slots.length - 1];
}
function getGreeting() {
  const slot = getGreetingSlot();
  const messages = slot?.messages?.length ? slot.messages : ["안녕하세요"];
  const seed = fortuneSeed(`${formatDateKey(new Date())}|greeting`, String(slot?.start ?? 0));
  return fortunePick(messages, seed);
}
function getGreetingIconClass(slot = getGreetingSlot()) {
  const icon = String(slot?.icon || "").trim().replace(/^fa-/, "");
  if (icon) return icon;
  return GREETING_ICON_BY_EMOJI[slot?.emoji] || "sun";
}
function renderHomeGreeting() {
  const root = document.getElementById("home-greeting");
  if (!root) return;
  root.textContent = `${getGreeting()}, ${getDisplayName()}님`;
}
function buildPromptByMoodFromJson(json) {
  const map = {};
  for (const [mood, items] of Object.entries(json?.moods || {})) {
    map[mood] = (items || []).map((item) => ({
      emoji: item.emoji || "✍️",
      title: item.title || "",
      desc: item.example || item.desc || "",
      keywords: item.keywords || [],
      emotion: item.emotion || mood,
    }));
  }
  return map;
}
function initPromptRotationKeys() {
  for (const key of getPromptMoodKeys()) {
    if (promptRotation[key] == null) promptRotation[key] = 0;
  }
  if (promptRotation.default == null) promptRotation.default = 0;
}
function loadEmotionsFromJson(json) {
  if (Array.isArray(json?.emotions) && json.emotions.length) {
    emotionOptions = json.emotions.map((e) => ({
      id: e.id || e.label,
      emoji: e.emoji || "📝",
      label: e.label || e.id,
      chip: e.chip || "emo-think",
    }));
    return;
  }
  emotionOptions = Object.keys(json?.moods || {})
    .filter((k) => k !== "default")
    .map((id) => ({ id, emoji: "📝", label: id, chip: "emo-think" }));
}
function getPromptMoodKeys() {
  return emotionOptions.map((e) => e.id).filter((id) => id !== "default" && promptByMood[id]);
}
const LEADING_EMOJI_RE =
  /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;
function parseMoodLabel(mood) {
  const text = String(mood || "").trim();
  const stripped = text.replace(LEADING_EMOJI_RE, "").trim();
  return stripped || text;
}
function extractLeadingEmoji(mood) {
  const text = String(mood || "").trim();
  const match = text.match(LEADING_EMOJI_RE);
  return match ? match[1] : null;
}
function getEmotionById(id) {
  const key = parseMoodLabel(id);
  return emotionOptions.find((e) => e.id === key || e.label === key);
}
function formatMoodForSave(moodId) {
  const emotion = getEmotionById(moodId);
  return emotion ? `${emotion.emoji} ${emotion.label}` : moodId;
}
function getEmotionChipClass(mood) {
  return getEmotionById(mood)?.chip || "emo-think";
}
function moodMatchesFilter(recordMood, filterId) {
  if (filterId === "all") return true;
  return parseMoodLabel(recordMood) === filterId;
}
function recordDateKey(record) {
  if (record?.entryDate) return String(record.entryDate).slice(0, 10);
  if (!record?.createdAt) return "";
  return toDateKey(new Date(record.createdAt));
}
function diaryEntryDate(reference = new Date()) {
  return toDateKey(reference);
}
function renderEmotionPickers() {
  if (!emotionOptions.length) return;
  const select = document.getElementById("manual-mood");
  if (!select) return;
  const current = select.value;
  select.innerHTML = emotionOptions
    .map((e) => `<option value="${escapeHtml(e.id)}">${e.emoji} ${escapeHtml(e.label)}</option>`)
    .join("");
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}
function renderMoodFilter() {
  const select = document.getElementById("filter-mood");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="all">감정 전체</option>';
  for (const e of emotionOptions) {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.label;
    select.appendChild(opt);
  }
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}
async function loadAppData() {
  try {
    const [promptsRes, fortuneRes, greetingRes, animationsRes] = await Promise.all([
      fetch("./data/prompts.json"),
      fetch("./data/fortune.json"),
      fetch("./data/greeting.json"),
      fetch("./data/animations.json"),
    ]);
    if (promptsRes.ok) {
      const promptsJson = await promptsRes.json();
      loadEmotionsFromJson(promptsJson);
      promptByMood = buildPromptByMoodFromJson(promptsJson);
      initPromptRotationKeys();
      renderEmotionPickers();
      renderMoodFilter();
    }
    if (fortuneRes.ok) {
      fortuneData = await fortuneRes.json();
      if (state.fortuneBirthday) refreshFortune();
    }
    if (greetingRes.ok) {
      greetingData = await greetingRes.json();
    }
    if (animationsRes.ok) {
      window.__HANDAM_ANIMATIONS__ = deepMerge(
        DEFAULT_ANIMATIONS,
        parseJsonWithComments(await animationsRes.text())
      );
    }
  } catch (_error) {
    console.warn("앱 데이터 JSON 로드 실패 — 기본값 사용");
  }
  await loadAnimations();
  if (!Object.keys(promptByMood).length) {
    promptByMood = { default: [{ emoji: "✍️", title: "오늘의 한 줄", desc: "오늘 마음을 짧게 남겨보세요.", keywords: [] }] };
  }
  if (!emotionOptions.length) {
    emotionOptions = [
      { id: "행복", emoji: "😊", label: "행복", chip: "emo-happy" },
      { id: "평온", emoji: "😌", label: "평온", chip: "emo-calm" },
    ];
    renderEmotionPickers();
    renderMoodFilter();
  }
}
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
function formatTodayLabel(now = new Date()) {
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일, ${WEEKDAY_LABELS[now.getDay()]}요일`;
}
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
const WEEK_STRIP_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
let lastHomeDiaryDateKey = diaryEntryDate();
function moodToEmoji(mood) {
  const emotion = getEmotionById(mood);
  if (emotion?.emoji) return emotion.emoji;
  const leading = extractLeadingEmoji(mood);
  if (leading) return leading;
  return "📝";
}
const MOOD_COLORS = Object.freeze({
  행복: "#E9B958", 평온: "#94A873", 설렘: "#DF907C", 차분: "#82A8A0", 지침: "#A99B8D",
  감사: "#CDA66B", 슬픔: "#7694B3", 분노: "#CE6E57", 불안: "#B18AB7", 자신: "#D18B49",
});
function moodColor(mood) {
  return MOOD_COLORS[parseMoodLabel(mood)] || "#9DB09F";
}
function moodTint(mood) {
  return `${moodColor(mood)}2E`;
}
function emotionBadgeHtml(mood) {
  const label = parseMoodLabel(mood) || "기록";
  return `<span class="emotion-badge ${getEmotionChipClass(mood)}"><b aria-hidden="true">${moodToEmoji(mood)}</b>${escapeHtml(label)}</span>`;
}
const MOOD_ADJECTIVES = Object.freeze({
  행복: "행복한", 평온: "평온한", 설렘: "설레는", 차분: "차분한", 지침: "지친", 감사: "감사한",
  슬픔: "슬픈", 분노: "화난", 불안: "불안한", 자신: "자신감 있는",
});
function statsEntries(records = state.records) {
  return records.map((record) => ({
    dateKey: recordDateKey(record),
    mood: parseMoodLabel(record.mood),
    createdAt: record.createdAt,
  }));
}
function insightForStats(stats, scope = "전체") {
  if (!stats.recordCount) {
    return scope === "주간"
      ? ["마음 기록을 기다리고 있어요", "이번 주의 첫 마음을 남겨보세요."]
      : ["첫 마음을 기다리고 있어요", "오늘의 작은 마음부터 천천히 남겨보세요."];
  }
  const adjective = MOOD_ADJECTIVES[stats.dominantMood] || `${stats.dominantMood}한`;
  return scope === "주간"
    ? [`${adjective} 마음이 가장 많이 머물렀어요`, "이번 주의 마음을 천천히 돌아보세요."]
    : [`${adjective} 마음이 가장 많이 머물렀어요`, "차곡차곡 쌓인 기록이 지금의 마음을 보여줘요."];
}
function renderMoodDistribution(bar, legend, distribution, limit = 6) {
  if (!bar || !legend) return;
  const visible = distribution.slice(0, limit);
  if (!visible.length) {
    bar.innerHTML = '<span class="mood-distribution-empty"></span>';
    bar.setAttribute("aria-label", "감정 기록 없음");
    legend.innerHTML = '<span class="muted">아직 감정 기록이 없어요</span>';
    return;
  }
  bar.innerHTML = visible.map((item) => {
    const color = MOOD_COLORS[item.mood] || "#B8A895";
    return `<span style="--mood-width:${item.percentage};--mood-color:${color}" title="${escapeHtml(item.mood)} ${item.percentage}%"></span>`;
  }).join("");
  bar.setAttribute("aria-label", visible.map((item) => `${item.mood} ${item.percentage}%`).join(", "));
  legend.innerHTML = visible.map((item) => {
    const color = MOOD_COLORS[item.mood] || "#B8A895";
    return `<span><i style="--mood-color:${color}"></i>${escapeHtml(item.mood)} ${item.percentage}%</span>`;
  }).join("");
}
function computeWritingStreak(records) {
  return calculateCurrentStreak(records.map(recordDateKey).filter(Boolean), diaryEntryDate());
}
function bindHomeWeekStrip() {
  const strip = document.getElementById("home-weekstrip");
  const card = document.getElementById("home-week-card");
  if (!strip || !card || strip.dataset.bound === "1") return;
  strip.dataset.bound = "1";
  strip.addEventListener("click", (e) => {
    const day = e.target.closest(".day");
    if (!day) return;
    const dot = day.querySelector(".dot");
    if (dot?.classList.contains("dot-add")) {
      e.stopPropagation();
      go("diary");
    }
  });
  card.addEventListener("click", () => openWeekStatsSheet(card));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openWeekStatsSheet(card);
  });
}
function refreshHomeIfDateChanged() {
  const todayKey = diaryEntryDate();
  if (todayKey === lastHomeDiaryDateKey) return;
  lastHomeDiaryDateKey = todayKey;
  updateUserUI();
  if (document.getElementById("week-stats-sheet")?.classList.contains("show")) {
    state.weekStatsReference = getWeekStart(new Date());
    renderWeekStatsSheet();
  }
  if (currentPageId() === "fortune" && fortuneData && state.fortuneBirthday) {
    refreshFortune();
    renderFortuneUI();
  }
}
function updateHomeWeekDiary() {
  const summaryEl = document.getElementById("home-week-summary");
  const strip = document.getElementById("home-weekstrip");
  if (!strip) return;
  bindHomeWeekStrip();
  const weekDates = getWeekStripDates(new Date());
  const todayKey = diaryEntryDate();
  const byDate = {};
  for (const record of state.records) {
    const key = recordDateKey(record);
    if (!key) continue;
    if (!byDate[key] || record.createdAt > byDate[key].createdAt) byDate[key] = record;
  }
  const dayEls = strip.querySelectorAll(".day");
  weekDates.forEach((date, index) => {
    const dayEl = dayEls[index];
    if (!dayEl) return;
    const key = toDateKey(date);
    const record = byDate[key];
    const isToday = key === todayKey;
    const lbl = dayEl.querySelector(".lbl");
    const dot = dayEl.querySelector(".dot");
    dayEl.classList.toggle("today", isToday);
    if (lbl) lbl.textContent = WEEK_STRIP_LABELS[index];
    if (!dot) return;
    dot.classList.remove("dot-add");
    dot.removeAttribute("title");
    dayEl.classList.remove("day-add");
    dot.classList.remove("has-mood");
    dot.style.removeProperty("--mood-tint");
    if (record) {
      dot.textContent = moodToEmoji(record.mood);
      dot.classList.add("has-mood");
      dot.style.setProperty("--mood-tint", moodTint(record.mood));
    } else if (isToday) {
      dot.textContent = "＋";
      dot.classList.add("dot-add");
      dayEl.classList.add("day-add");
      dot.title = "오늘 일기 쓰기";
    } else {
      dot.textContent = String(date.getDate());
    }
  });
  const weekKeys = new Set(weekDates.map(toDateKey));
  const daysWritten = new Set(
    state.records.map(recordDateKey).filter((key) => key && weekKeys.has(key))
  ).size;
  const streak = computeWritingStreak(state.records);
  if (!summaryEl) return;
  if (state.records.length === 0) {
    summaryEl.textContent = "아직 기록이 없어요";
    return;
  }
  summaryEl.textContent = `${daysWritten}일 기록 · ${streak}일 연속${streak >= 3 ? " 🔥" : ""}`;
}
let weekStatsReturnFocus = null;
function formatWeekRange(dates) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  return `${first.getMonth() + 1}.${first.getDate()} 월 — ${last.getMonth() + 1}.${last.getDate()} 일`;
}
function earliestRecordWeekKey() {
  const keys = state.records.map(recordDateKey).filter(Boolean).sort();
  if (!keys.length) return "";
  const [year, month, day] = keys[0].split("-").map(Number);
  return toDateKey(getWeekStart(new Date(year, month - 1, day, 12)));
}
function recordsForWeek(reference) {
  const keys = new Set(getWeekStripDates(reference).map(toDateKey));
  return state.records.filter((record) => keys.has(recordDateKey(record)));
}
function renderWeekStatsSheet() {
  const reference = state.weekStatsReference || getWeekStart(new Date());
  const dates = getWeekStripDates(reference);
  const records = recordsForWeek(reference);
  const stats = calculateDiaryStats(statsEntries(records));
  const currentWeekKey = toDateKey(getWeekStart(new Date()));
  const selectedWeekKey = toDateKey(dates[0]);
  const earliestWeekKey = earliestRecordWeekKey();
  const range = formatWeekRange(dates);
  const latestByDate = {};

  for (const record of records) {
    const key = recordDateKey(record);
    if (!latestByDate[key] || String(record.createdAt || "") > String(latestByDate[key].createdAt || "")) latestByDate[key] = record;
  }

  document.getElementById("week-stats-range").textContent = range;
  document.getElementById("week-stats-range-compact").textContent = range;
  const days = document.getElementById("week-stats-days");
  days.innerHTML = dates.map((date, index) => {
    const key = toDateKey(date);
    const record = latestByDate[key];
    const isToday = key === diaryEntryDate();
    const mood = record ? parseMoodLabel(record.mood) : "";
    return `<div class="week-stats-day${isToday ? " is-today" : ""}">
      <span>${WEEK_STRIP_LABELS[index]}</span><b>${date.getDate()}</b>
      <i aria-hidden="true">${record ? moodToEmoji(record.mood) : "–"}</i>
      <small>${escapeHtml(mood)}</small>
    </div>`;
  }).join("");

  const [title, copy] = insightForStats(stats, "주간");
  document.getElementById("week-stats-insight-title").textContent = title;
  document.getElementById("week-stats-insight-copy").textContent = copy;
  document.getElementById("week-stats-days-written").textContent = `${stats.daysWritten}일`;
  document.getElementById("week-stats-current-streak").textContent = `${computeWritingStreak(state.records)}일`;
  renderMoodDistribution(
    document.getElementById("week-stats-distribution-bar"),
    document.getElementById("week-stats-distribution-legend"),
    stats.distribution
  );
  document.getElementById("week-stats-content").hidden = stats.recordCount === 0;
  document.getElementById("week-stats-empty").hidden = stats.recordCount !== 0;

  const prev = document.getElementById("week-stats-prev");
  const next = document.getElementById("week-stats-next");
  prev.disabled = !earliestWeekKey || selectedWeekKey <= earliestWeekKey;
  next.disabled = selectedWeekKey >= currentWeekKey;
  prev.setAttribute("aria-label", `${formatWeekRange(getWeekStripDates(shiftWeek(reference, -1)))} 보기`);
  next.setAttribute("aria-label", `${formatWeekRange(getWeekStripDates(shiftWeek(reference, 1)))} 보기`);
}
function openWeekStatsSheet(trigger = document.getElementById("home-week-card")) {
  if (document.getElementById("sheet")?.classList.contains("show")) closeSheet({ restoreFocus: false });
  const scrim = document.getElementById("week-stats-scrim");
  const sheet = document.getElementById("week-stats-sheet");
  weekStatsReturnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
  state.weekStatsReference = getWeekStart(new Date());
  renderWeekStatsSheet();
  sheet.removeAttribute("inert");
  sheet.setAttribute("aria-hidden", "false");
  scrim.setAttribute("aria-hidden", "false");
  scrim.classList.add("show");
  sheet.classList.add("show");
  document.getElementById("home-week-card")?.setAttribute("aria-expanded", "true");
  document.body.classList.add("is-week-stats-open");
  requestAnimationFrame(() => document.getElementById("week-stats-close")?.focus({ preventScroll: true }));
}
function closeWeekStatsSheet({ restoreFocus = true } = {}) {
  const scrim = document.getElementById("week-stats-scrim");
  const sheet = document.getElementById("week-stats-sheet");
  if (!sheet?.classList.contains("show")) return;
  scrim.classList.remove("show");
  sheet.classList.remove("show");
  sheet.setAttribute("aria-hidden", "true");
  sheet.setAttribute("inert", "");
  scrim.setAttribute("aria-hidden", "true");
  document.getElementById("home-week-card")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-week-stats-open");
  if (restoreFocus && weekStatsReturnFocus?.isConnected) weekStatsReturnFocus.focus({ preventScroll: true });
  weekStatsReturnFocus = null;
}
function moveWeekStats(amount) {
  state.weekStatsReference = shiftWeek(state.weekStatsReference || new Date(), amount);
  renderWeekStatsSheet();
}
function bindWeekStatsSheet() {
  document.getElementById("week-stats-scrim")?.addEventListener("click", () => closeWeekStatsSheet());
  document.getElementById("week-stats-close")?.addEventListener("click", () => closeWeekStatsSheet());
  document.getElementById("week-stats-prev")?.addEventListener("click", () => moveWeekStats(-1));
  document.getElementById("week-stats-next")?.addEventListener("click", () => moveWeekStats(1));
  document.getElementById("week-stats-records")?.addEventListener("click", () => {
    closeWeekStatsSheet({ restoreFocus: false });
    go("records");
  });
  document.getElementById("week-stats-write")?.addEventListener("click", () => {
    closeWeekStatsSheet({ restoreFocus: false });
    go("diary");
  });
  document.addEventListener("keydown", (event) => {
    const sheet = document.getElementById("week-stats-sheet");
    if (!sheet?.classList.contains("show")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeWeekStatsSheet();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...sheet.querySelectorAll('button:not([disabled]),[href],select,input,[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}
function updateBackupStats() {
  const el = document.getElementById("backup-local-desc");
  if (!el) return;
  const count = state.records.length;
  const location = state.recordsSource === "firestore" ? "계정에 동기화됨" : "이 기기 캐시에 저장됨";
  el.textContent = `일기 ${count}편 · ${location}`;
}
function updateMypageStats() {
  const el = (id) => document.getElementById(id);
  const keys = state.records.map(recordDateKey).filter(Boolean);
  const months = new Set(keys.map((key) => key.slice(0, 7)));
  if (el("mypage-total")) el("mypage-total").textContent = String(state.records.length);
  if (el("mypage-months")) el("mypage-months").textContent = String(months.size);
  if (el("mypage-streak")) el("mypage-streak").textContent = `${computeWritingStreak(state.records)}일`;
}
function updateDiaryStatsUI() {
  updateHomeWeekDiary();
  updateBackupStats();
  updateMypageStats();
}
function updateUserUI() {
  const name = getDisplayName();
  const el = (id) => document.getElementById(id);
  renderHomeGreeting();
  if (el("home-date")) el("home-date").textContent = formatTodayLabel();
  if (el("fortune-date")) el("fortune-date").textContent = `${formatTodayLabel()} · 오늘의 기운`;
  if (el("settings-display-name")) el("settings-display-name").textContent = name;
  if (el("settings-email")) el("settings-email").textContent = state.auth?.email || state.profile?.email || "로그인이 필요해요";
  if (el("settings-avatar")) el("settings-avatar").textContent = name.slice(0, 1);
  if (el("header-avatar")) el("header-avatar").textContent = name.slice(0, 1);
  updateDiaryStatsUI();
}

/* ---------- Writer (records page editor) ---------- */
function setEditorOpen(open) {
  const editor = document.getElementById("diary-editor");
  const toggle = document.getElementById("writer-toggle");
  if (!editor || !toggle) return;
  editor.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.innerHTML = open
    ? '<svg class="icon" aria-hidden="true"><use href="#i-x"/></svg><span>작성 닫기</span>'
    : '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>새로운 기록</span>';
  if (open) {
    const date = document.getElementById("manual-date");
    if (date) {
      date.max = diaryEntryDate();
      if (!date.value) date.value = diaryEntryDate();
    }
  }
}
function resetWriterForm() {
  const title = document.getElementById("manual-title");
  const body = document.getElementById("manual-body");
  const date = document.getElementById("manual-date");
  const mood = document.getElementById("manual-mood");
  if (title) title.value = "";
  if (body) body.value = "";
  if (date) date.value = diaryEntryDate();
  if (mood && mood.options.length) mood.selectedIndex = 0;
  state.selectedPrompt = "";
  clearOcrSelection();
}
function openWriter({ reset = false, focus = "title" } = {}) {
  if (reset) resetWriterForm();
  if (currentPageId() !== "records") go("records");
  setEditorOpen(true);
  requestAnimationFrame(() => {
    const editor = document.getElementById("diary-editor");
    const page = document.getElementById("page-records");
    if (editor && page) page.scrollTo({ top: Math.max(0, editor.offsetTop - 12), behavior: "smooth" });
    const target = document.getElementById(focus === "body" ? "manual-body" : "manual-title");
    target?.focus({ preventScroll: true });
  });
}
function openManualDiary() {
  openWriter({ reset: true });
}
function buildDiaryCorpus(records) {
  return records.map((r) => `${r.title} ${r.body} ${r.summary || ""} ${r.mood}`).join(" ").toLowerCase();
}
function analyzeEmotionsFromRecent(maxEntries = 14) {
  const recent = state.records.slice(0, maxEntries);
  const moodKeys = getPromptMoodKeys();
  const counts = {};
  for (const key of moodKeys) counts[key] = 0;
  for (const record of recent) {
    const mood = parseMoodLabel(record.mood);
    if (moodKeys.includes(mood)) counts[mood] += 1;
    else if (mood) counts[mood] = (counts[mood] || 0) + 1;
  }
  const total = recent.length;
  const ranked = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const distribution = {};
  if (total > 0) {
    for (const [mood, count] of ranked) {
      distribution[mood] = Math.round((count / total) * 100);
    }
  }
  const dominantMood = ranked[0]?.[0] || "default";
  return {
    recent,
    total,
    counts,
    distribution,
    dominantMood,
    ranked,
    corpus: buildDiaryCorpus(recent),
  };
}

function calculatePromptScore(prompt, cardMoodKey, analysis) {
  const { distribution, total, dominantMood, corpus } = analysis;
  if (total === 0) return null;
  const baseKey = getPromptMoodKeys().includes(cardMoodKey) ? cardMoodKey : "default";
  let score = distribution[baseKey] || 0;
  const keywords = prompt.keywords || [];
  let hits = 0;
  for (const kw of keywords) {
    if (corpus.includes(kw.toLowerCase())) hits += 1;
  }
  score += Math.min(15, hits * 4);
  if (baseKey === dominantMood) score += 6;
  const recentTitles = analysis.recent.map((r) => r.title);
  if (!recentTitles.some((t) => t.includes(prompt.title.slice(0, 3)))) score += 4;
  return Math.max(5, Math.min(99, Math.round(score)));
}

function pickPromptCards(analysis) {
  const { ranked, total } = analysis;
  if (total === 0) {
    const pool = promptByMood.default;
    const offset = promptRotation.default % pool.length;
    return [0, 1, 2].map((i) => ({
      prompt: pool[(offset + i) % pool.length],
      moodKey: "default",
    }));
  }
  const moodSlots = [
    ranked[0]?.[0],
    ranked[1]?.[0] || ranked[0]?.[0],
    ranked[2]?.[0] || ranked[1]?.[0] || ranked[0]?.[0],
  ].map((m) => (promptByMood[m] ? m : "default"));
  return moodSlots.map((moodKey, index) => {
    const pool = promptByMood[moodKey] || promptByMood.default;
    const offset = (promptRotation[moodKey] || 0) + index;
    return { prompt: pool[offset % pool.length], moodKey };
  });
}

function formatPromptMeta(analysis) {
  if (analysis.total === 0) {
    return "아직 분석할 일기가 없어요.<br>기록하면 감정 비율에 맞춰 추천해 드려요.";
  }
  const parts = analysis.ranked
    .slice(0, 4)
    .map(([mood, count]) => `${mood} <b style="color:var(--text)">${Math.round((count / analysis.total) * 100)}%</b>`);
  const dominant = analysis.dominantMood;
  return `최근 <b style="color:var(--text)">${analysis.total}편</b> 감정 분석 · ${parts.join(" · ")}<br>주요 감정 <b style="color:var(--text)">"${dominant}"</b> 기준 글감`;
}

function callWorker(type, payload = {}) { return new Promise((resolve, reject) => { const id = ++workerSeq; workerWaiters.set(id, { resolve, reject }); dbWorker.postMessage({ id, type, payload }); }); }
function persistSerialized(result) { if (result?.serialized) localStorage.setItem("handam-sqlite", JSON.stringify(result.serialized)); }
function initWorker() { dbWorker = new Worker("./db-worker.js"); dbWorker.onmessage = (event) => { const { id, data, error } = event.data || {}; const waiter = workerWaiters.get(id); if (!waiter) return; workerWaiters.delete(id); if (error) waiter.reject(new Error(error)); else waiter.resolve(data); }; const serialized = localStorage.getItem("handam-sqlite"); return callWorker("init", { serialized: serialized ? JSON.parse(serialized) : null }).then((data) => { persistSerialized(data); return data; }); }
function formatDate(isoDate) { const date = new Date(isoDate); return `${date.getMonth() + 1}월 ${date.getDate()}일`; }
function apiPost(url, payload) { return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "요청이 실패했습니다."); return data; }); }
function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "").split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); }); }
/** OCR 업로드용 — 긴 변 최대 maxEdge, JPEG로 통일 */
function prepareImageForOcr(file, maxEdge = 1920, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        fileToBase64(file).then(resolve).catch(reject);
        return;
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1] || "");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fileToBase64(file).then(resolve).catch(reject);
    };
    img.src = url;
  });
}
function currentPageId() { return document.querySelector(".page.active")?.id?.replace("page-", "") || ""; }
async function setAuthFromUser(user, { profileOverride = null } = {}) {
  const signupOverride = pendingSignupProfile?.email === String(user.email || "").trim().toLowerCase()
    ? pendingSignupProfile
    : null;
  const resolvedOverride = profileOverride || signupOverride;
  const idToken = await user.getIdToken();
  state.auth = {
    uid: user.uid,
    email: user.email || null,
    idToken,
  };
  state.profile = loadProfile(user.uid);
  const patch = {};
  if (resolvedOverride?.displayName) patch.displayName = resolvedOverride.displayName;
  else if (!state.profile?.displayName && user.displayName) patch.displayName = user.displayName;
  if (resolvedOverride?.email) patch.email = resolvedOverride.email;
  else if (!state.profile?.email && user.email) patch.email = user.email;
  if (Object.keys(patch).length) state.profile = saveProfile(user.uid, patch);
  rememberLastAccount(user.email);
  if (cloudLoadUid !== user.uid || !cloudLoadPromise) {
    cloudLoadUid = user.uid;
    cloudLoadPromise = loadCloudUserData(user, resolvedOverride);
  }
  await cloudLoadPromise;
  startPresenceHeartbeat();
}
function authErrorMessage(error, context = {}) {
  const code = error?.code || "";
  const message = error?.message || "";
  if (code === "auth/configuration-not-found" || code === "auth/auth-domain-config-required") {
    return "Firebase 인증 설정이 비어 있어요. Authentication에서 로그인 제공자를 활성화해주세요.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return context.flow === "reset"
      ? "입력한 이메일이 등록되어 있다면 재설정 메일을 보내드려요."
      : "이메일 또는 비밀번호를 확인해주세요.";
  }
  if (code === "auth/email-already-in-use") return "이미 사용 중인 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해주세요.";
  if (code === "auth/invalid-email") return "이메일 형식을 확인해주세요.";
  if (code === "auth/weak-password") return "비밀번호는 6자 이상 입력해주세요.";
  if (code === "auth/network-request-failed") return "인터넷 연결을 확인한 뒤 다시 시도해주세요.";
  if (code === "auth/requires-recent-login") return "보안을 위해 다시 로그인한 뒤 시도해주세요.";
  if (code === "auth/popup-closed-by-user") return "로그인 창이 닫혔어요. 다시 시도해주세요.";
  if (code === "auth/popup-blocked") return "팝업이 차단됐어요. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.";
  if (code === "auth/operation-not-allowed") {
    return "해당 로그인 방식이 비활성화되어 있어요. Firebase Console에서 활성화해주세요.";
  }
  if (code === "auth/too-many-requests") return "요청이 너무 많아요. 잠시 후 다시 시도해주세요.";
  if (context.flow === "signup") return "회원가입을 완료하지 못했어요. 입력 내용을 확인하고 다시 시도해주세요.";
  if (context.flow === "reset") return "재설정 메일 요청을 완료하지 못했어요. 잠시 후 다시 시도해주세요.";
  return message && !message.startsWith("Firebase:") ? message : "인증 처리에 실패했어요.";
}

function replayRevealAnimations(pageEl) {
  pageEl.querySelectorAll(".reveal").forEach((el) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  });
}

const PAGE_TITLES = Object.freeze({
  home: "오늘의 한담",
  records: "나의 기록",
  "record-detail": "기록 상세",
  analysis: "감정 분석",
  report: "회고 리포트",
  settings: "마이페이지",
  fortune: "오늘의 운세",
  prompts: "오늘의 질문",
  password: "비밀번호 변경",
  backup: "백업 · 내보내기",
});
const NAV_PARENT = Object.freeze({
  "record-detail": "records",
  fortune: "home",
  prompts: "home",
  password: "settings",
  backup: "settings",
});
function go(id) {
  if (id === "admin") {
    if (!state.admin?.token) return go("login");
    const options = {
      getSession: () => state.admin,
      onSessionChange: (session) => {
        state.admin = session;
        sessionStorage.setItem("handam-admin", JSON.stringify(session));
      },
      onLogout: adminLogout,
    };
    if (window.handamAdmin) window.handamAdmin.mount(options);
    else window.handamAdminPending = options;
    return;
  }
  if (id === "diary" || id === "manual") {
    openWriter({ reset: id === "diary" });
    return;
  }
  if (document.getElementById("week-stats-sheet")?.classList.contains("show")) {
    closeWeekStatsSheet({ restoreFocus: false });
  }
  window.handamAdminPending = undefined;
  window.handamAdmin?.unmount();
  const target = document.getElementById("page-" + id);
  if (!target) return;
  if (AUTH_PAGES.has(id)) closeSheet({ restoreFocus: false });
  const previous = currentPageId();
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p === target));
  const navPage = NAV_PARENT[id] || id;
  document.querySelectorAll(".nav-item").forEach((n) => {
    const active = n.dataset.page === navPage;
    n.classList.toggle("active", active);
    if (active) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  document.querySelector(".device")?.classList.toggle("auth-mode", AUTH_PAGES.has(id));
  const header = document.getElementById("app-header");
  if (header) header.classList.toggle("is-subpage", id !== "home");
  const headerTitle = document.getElementById("header-title");
  if (headerTitle) headerTitle.textContent = PAGE_TITLES[id] || "한담";
  const device = document.querySelector(".device");
  if (device) device.scrollTop = 0;
  if (previous !== id) target.scrollTop = 0;
  replayRevealAnimations(target);
  if (id === "fortune") {
    if (fortuneData && state.fortuneBirthday) refreshFortune();
    syncFortuneOpenedState();
    renderFortuneUI();
  }
  if (id === "records") {
    if (previous !== "records" && previous !== "record-detail") setEditorOpen(false);
    renderRecordsPage();
  }
  if (id === "analysis") renderAnalysis();
  if (id === "report") renderReport();
  if (id === "prompts") renderPromptRecommendations();
  if (id === "home" || id === "settings") {
    updateUserUI();
    renderFortuneUI();
  }
  if (id === "backup") updateBackupStats();
  if (AUTH_PAGES.has(id)) {
    requestAnimationFrame(() => {
      const heading = target.querySelector("h1");
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
  }
}
function applyTheme(t, { save = true } = {}) {
  const theme = t === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  const themeBtn = document.getElementById("theme-btn");
  if (themeBtn) themeBtn.innerHTML = theme === "dark" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  document.getElementById("dark-switch")?.classList.toggle("on", theme === "dark");
  document.getElementById("dark-switch")?.setAttribute("aria-checked", String(theme === "dark"));
  localStorage.setItem("handam-theme", theme);
  if (save && state.settings) saveSettingsPatch({ theme }).catch(() => {});
}
function toggleTheme(event) {
  if (event) event.stopPropagation();
  const cur = document.documentElement.getAttribute("data-theme");
  void saveSettingsWithFeedback({ theme: cur === "dark" ? "light" : "dark" });
}
function toggleSwitch(event, element, message) {
  if (event) event.stopPropagation();
  const enabled = !element.classList.contains("on");
  element.classList.toggle("on", enabled);
  const setting = element.dataset.setting;
  if (setting) saveSettingsPatch({ [setting]: enabled }).catch(() => {});
  if (message) showToast(message);
}
function showToast(message) {
  const toast = document.getElementById("toast");
  const duration = getAnimations().toast?.durationMs ?? 1900;
  // Empty the live region first so repeating the same status is announced again.
  toast.textContent = "";
  clearTimeout(window._toastMessageTimer);
  window._toastMessageTimer = setTimeout(() => { toast.textContent = message; }, 30);
  toast.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove("show"), Math.max(duration, message.length > 45 ? 6000 : 1900));
}
function openSheet() {
  const scrim = document.getElementById("scrim");
  const sheet = document.getElementById("sheet");
  sheetReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sheet.removeAttribute("inert");
  sheet.setAttribute("aria-hidden", "false");
  scrim.setAttribute("aria-hidden", "false");
  scrim.classList.add("show");
  sheet.classList.add("show");
  requestAnimationFrame(() => {
    sheet.classList.add("sheet-entered");
    sheet.querySelector("select")?.focus({ preventScroll: true });
  });
}
function closeSheet({ restoreFocus = true } = {}) {
  const scrim = document.getElementById("scrim");
  const sheet = document.getElementById("sheet");
  sheet.classList.remove("sheet-entered");
  scrim.classList.remove("show");
  sheet.classList.remove("show");
  sheet.setAttribute("aria-hidden", "true");
  sheet.setAttribute("inert", "");
  scrim.setAttribute("aria-hidden", "true");
  if (restoreFocus && sheetReturnFocus?.isConnected) sheetReturnFocus.focus({ preventScroll: true });
  sheetReturnFocus = null;
}
function animateGauge() {
  const num = document.getElementById("gauge-num");
  if (!num) return;
  if (window._gauge) cancelAnimationFrame(window._gauge);
  if (!state.fortune) {
    num.textContent = "—";
    return;
  }
  const target = state.fortune.total;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    num.textContent = String(target);
    return;
  }
  let v = 0;
  const tick = () => {
    const remaining = target - v;
    v += Math.max(1, Math.ceil(remaining * 0.08));
    if (v >= target) {
      v = target;
      num.textContent = String(v);
      return;
    }
    num.textContent = String(v);
    window._gauge = requestAnimationFrame(tick);
  };
  window._gauge = requestAnimationFrame(tick);
}
function setOcrStep(step) {
  const upload = document.getElementById("ocr-upload");
  const loading = document.getElementById("ocr-loading");
  if (upload) upload.style.display = step === "loading" ? "none" : "block";
  if (loading) loading.style.display = step === "loading" ? "block" : "none";
}
function getSelectedMood(selector) {
  const select = document.querySelector(selector);
  if (select?.value) return select.value;
  return emotionOptions[0]?.id || "평온";
}

/** Clova OCR 결과 → 직접 입력 폼 (제목·본문). 저장은 사용자가 직접 입력 화면에서. */
function fillManualFromOcr(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  const titleEl = document.getElementById("manual-title");
  const bodyEl = document.getElementById("manual-body");
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let title = state.selectedPrompt || "";
  let body = normalized;
  if (!title && lines.length > 1) {
    title = lines[0].slice(0, 80);
    body = lines.slice(1).join("\n");
  }
  if (titleEl) titleEl.value = title;
  if (bodyEl) {
    bodyEl.value = body;
    requestAnimationFrame(() => {
      bodyEl.focus();
      const end = bodyEl.value.length;
      bodyEl.setSelectionRange(end, end);
    });
  }
  return true;
}

async function runOCRFile(file) {
  if (!file) return;
  if (!file.type?.startsWith("image/")) {
    showToast("이미지 파일만 선택할 수 있어요.");
    return;
  }
  setOcrStep("loading");
  const status = document.getElementById("ocr-status");
  if (status) status.textContent = "네이버 Clova로 손글씨를 인식하고 있어요…";
  try {
    const imageBase64 = await prepareImageForOcr(file);
    if (!imageBase64) throw new Error("이미지를 불러오지 못했어요.");
    const ocrData = await apiPost("/api/ocr", { imageBase64, format: "jpg" });
    const text = String(ocrData.text || "").trim();
    if (!text) throw new Error("인식된 글자가 없어요. 밝은 곳에서 다시 촬영해 주세요.");
    resetOCR();
    fillManualFromOcr(text);
    showToast("인식한 글을 기록란에 넣었어요. 확인한 뒤 저장하세요.");
    openWriter({ focus: "body" });
  } catch (error) {
    showToast(error.message || "OCR 처리에 실패했어요.");
    resetOCR();
  }
}

function previewOcrFile(file) {
  if (!file) return;
  if (!file.type?.startsWith("image/")) {
    showToast("이미지 파일만 선택할 수 있어요.");
    return;
  }
  state.ocrFile = file;
  const zone = document.getElementById("ocr-zone");
  const img = document.getElementById("ocr-preview");
  const run = document.getElementById("ocr-run-btn");
  if (img) {
    if (img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl);
    const url = URL.createObjectURL(file);
    img.dataset.objectUrl = url;
    img.src = url;
    img.alt = "선택한 다이어리 사진 미리보기";
    img.hidden = false;
  }
  zone?.classList.add("has-image");
  if (run) run.disabled = false;
}
function clearOcrSelection() {
  state.ocrFile = null;
  const img = document.getElementById("ocr-preview");
  if (img) {
    if (img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl);
    delete img.dataset.objectUrl;
    img.removeAttribute("src");
    img.hidden = true;
  }
  document.getElementById("ocr-zone")?.classList.remove("has-image");
  const run = document.getElementById("ocr-run-btn");
  if (run) run.disabled = true;
}
function openCameraOCR() { const input = document.getElementById("ocr-camera-file"); input.value = ""; input.click(); }
function openGalleryOCR() { const input = document.getElementById("ocr-gallery-file"); input.value = ""; input.click(); }
function resetOCR() { setOcrStep("upload"); }

async function saveManualDiary(event) {
  event?.preventDefault?.();
  const saveButton = document.getElementById("manual-save-btn");
  if (saveButton?.disabled) return;
  const title = document.getElementById("manual-title").value.trim() || "제목 없는 기록";
  const body = document.getElementById("manual-body").value.trim();
  if (!body) {
    document.getElementById("manual-body")?.focus();
    return showToast("기록 내용을 입력해주세요.");
  }
  const pickedDate = String(document.getElementById("manual-date")?.value || "");
  const entryDate = /^\d{4}-\d{2}-\d{2}$/.test(pickedDate) && pickedDate <= diaryEntryDate() ? pickedDate : diaryEntryDate();
  const mood = formatMoodForSave(getSelectedMood("#manual-mood"));
  setAuthButtonPending(saveButton, true, "AI가 기록을 정리하고 있어요…");
  try {
    await persistDiary({ title, body, mood, entryDate });
  } finally {
    setAuthButtonPending(saveButton, false);
  }
}
async function persistDiary({ title, body, mood, entryDate }) {
  let summary = body;
  const settings = currentSettings();
  let aiModel = "";
  let summaryGenerated = false;
  try {
    const ai = await apiPost("/api/llm/summarize", {
      text: body,
      persona: settings.persona,
      quality: settings.summaryQuality,
    });
    summary = ai.summary || summary;
    aiModel = String(ai.model || "").slice(0, 100);
    summaryGenerated = Boolean(ai.summary);
  } catch (_error) {}
  const uid = state.auth?.uid;
  try {
    if (uid && !state.auth?.isAdmin) {
      const recordRef = doc(userDiariesRef(uid));
      const now = new Date();
      await setDoc(recordRef, {
        uid,
        title: title.slice(0, 200),
        body: body.slice(0, 200000),
        mood: mood.slice(0, 50),
        summary: String(summary).slice(0, 10000),
        aiPersona: settings.persona,
        aiModel,
        summaryQuality: settings.summaryQuality,
        summaryGenerated,
        createdAt: Timestamp.fromDate(now),
        entryDate,
        syncedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const result = await callWorker("insert", {
        title,
        body,
        mood,
        summary,
        createdAt: new Date().toISOString(),
        entryDate,
      });
      persistSerialized(result);
    }
    await reloadRecords();
    resetWriterForm();
    setEditorOpen(false);
    showToast(uid && !state.auth?.isAdmin ? "기록을 계정에 저장했어요." : "기록을 이 기기에 저장했어요.");
    go("records");
  } catch (error) {
    console.error("일기 저장 실패", error);
    showToast("일기를 저장하지 못했어요. 연결을 확인해주세요.");
  }
}

function renderPromptRecommendations() {
  const analysis = analyzeEmotionsFromRecent(14);
  const picks = pickPromptCards(analysis);
  const cards = document.querySelectorAll(".prompt-slot");
  cards.forEach((card, index) => {
    const { prompt, moodKey } = picks[index];
    const score = calculatePromptScore(prompt, moodKey, analysis);
    card.dataset.score = score == null ? "" : String(score);
    card.dataset.mood = moodKey;
    const matchEl = card.querySelector(".match");
    if (score == null) {
      matchEl.textContent = "기록이 쌓이면 맞춤 추천돼요";
    } else {
      const moodLabel = moodKey === "default" ? "균형" : moodKey;
      matchEl.textContent = `${moodLabel} 감정과 ${score}% 어울려요`;
    }
    card.querySelector(".prompt-emoji").textContent = prompt.emoji;
    card.querySelector("h3").textContent = prompt.title;
    card.querySelector("p").textContent = prompt.desc;
  });
  const meta = document.getElementById("prompt-meta");
  const metaHtml = formatPromptMeta(analysis);
  if (meta && meta.innerHTML !== metaHtml) meta.innerHTML = metaHtml;
  const homePrompt = document.getElementById("home-prompt-teaser");
  if (homePrompt && picks[0]) homePrompt.textContent = picks[0].prompt.title;
}
function selectPromptSlot(slot) {
  document.querySelectorAll(".prompt-slot").forEach((card) => {
    const selected = card === slot;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-checked", String(selected));
  });
}

async function refreshPrompts() {
  const refreshBtn = document.getElementById("prompt-refresh-btn");
  if (refreshBtn?.disabled) return;
  const analysis = analyzeEmotionsFromRecent(14);
  const key = analysis.total === 0 ? "default" : (promptByMood[analysis.dominantMood] ? analysis.dominantMood : "default");
  promptRotation[key] = (promptRotation[key] || 0) + 1;
  await animatePromptRefresh(() => renderPromptRecommendations());
  showToast("새 글감을 골랐어요");
}
function startPromptDiary(card) {
  const title = (card?.querySelector?.("h3")?.textContent || String(card || "")).trim();
  if (!title) return;
  resetWriterForm();
  state.selectedPrompt = title;
  document.getElementById("manual-title").value = title;
  showToast(`“${title}” 질문으로 기록을 시작해요.`);
  openWriter({ focus: "body" });
}

/* ---------- Records list / home cards ---------- */
function dateFromKey(key) {
  const [y, m, d] = String(key || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12);
}
function formatEntryDate(record) {
  const date = dateFromKey(recordDateKey(record)) || new Date(record.createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_LABELS[date.getDay()]})`;
}
function openRecordDetail(record, returnPage = "records") {
  state.selectedRecordId = record.id;
  state.recordDetailReturnPage = returnPage;
  document.getElementById("record-title").textContent = record.title;
  document.getElementById("record-date").textContent = formatEntryDate(record);
  const moodEl = document.getElementById("record-mood");
  moodEl.className = `emotion-badge ${getEmotionChipClass(record.mood)}`;
  moodEl.innerHTML = `<b aria-hidden="true">${moodToEmoji(record.mood)}</b>${escapeHtml(parseMoodLabel(record.mood) || "기록")}`;
  document.getElementById("record-body").textContent = record.body;
  document.getElementById("record-summary").textContent = `“${record.summary || record.body.slice(0, 60)}”`;
  go("record-detail");
}
function bindActivate(element, handler) {
  element.addEventListener("click", handler);
  element.addEventListener("keydown", (event) => {
    if (event.target !== element || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    handler(event);
  });
}
function createRecordRow(record, returnPage = "records") {
  const row = document.createElement("article");
  row.className = "card archive-item diary-row tap";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `${record.title} 기록 열기`);
  const summary = record.summary && record.summary !== record.body
    ? `<p class="archive-summary"><svg class="icon" aria-hidden="true"><use href="#i-sparkles"/></svg><span>${escapeHtml(record.summary)}</span></p>`
    : "";
  row.innerHTML = `<div class="archive-content">
      <div>${emotionBadgeHtml(record.mood)}<span>${escapeHtml(formatEntryDate(record))}</span></div>
      <h4>${escapeHtml(record.title)}</h4>
      <p>${escapeHtml(record.body)}</p>
      ${summary}
    </div>
    <div class="item-actions">
      <button type="button" data-row-action="open" aria-label="${escapeHtml(record.title)} 자세히 보기"><svg class="icon" aria-hidden="true"><use href="#i-chevron"/></svg></button>
      <button type="button" class="danger" data-row-action="delete" aria-label="${escapeHtml(record.title)} 삭제"><svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg></button>
    </div>`;
  bindActivate(row, (event) => {
    const action = event.target.closest?.("[data-row-action]")?.dataset.rowAction;
    if (action === "delete") {
      event.stopPropagation();
      void deleteRecordWithConfirm(record);
      return;
    }
    openRecordDetail(record, returnPage);
  });
  return row;
}
function createEntryCard(record) {
  const card = document.createElement("article");
  card.className = "card entry-card tap";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${record.title} 기록 열기`);
  card.innerHTML = `<div class="entry-top">${emotionBadgeHtml(record.mood)}<span>${escapeHtml(formatEntryDate(record))}</span></div>
    <h4>${escapeHtml(record.title)}</h4>
    <p>${escapeHtml(record.summary || record.body)}</p>`;
  bindActivate(card, () => openRecordDetail(record, "home"));
  return card;
}
function renderHomeRecords() {
  const box = document.getElementById("home-record-list");
  if (!box) return;
  box.innerHTML = "";
  if (!state.records.length) {
    box.innerHTML = `<div class="card home-empty"><h4>첫 마음을 기다리고 있어요</h4><p>오늘의 작은 순간부터 천천히 남겨 보세요.</p></div>`;
    return;
  }
  state.records.slice(0, 2).forEach((record) => box.appendChild(createEntryCard(record)));
  refreshInteractions();
}
function renderRecordsPage() {
  const box = document.getElementById("records-list");
  const moodFilter = document.getElementById("filter-mood").value;
  const dateFilter = document.getElementById("filter-date").value;
  const search = String(document.getElementById("records-search")?.value || "").trim().toLowerCase();
  let rows = [...state.records];
  if (moodFilter !== "all") rows = rows.filter((r) => moodMatchesFilter(r.mood, moodFilter));
  if (search) rows = rows.filter((r) => `${r.title} ${r.body} ${r.summary}`.toLowerCase().includes(search));
  const sortKey = (r) => `${recordDateKey(r)}|${r.createdAt || ""}`;
  rows.sort((a, b) => (dateFilter === "oldest" ? sortKey(a).localeCompare(sortKey(b)) : sortKey(b).localeCompare(sortKey(a))));
  box.innerHTML = "";
  const hasRecords = state.records.length > 0;
  const count = document.getElementById("archive-count");
  if (count) count.textContent = String(state.records.length);
  document.getElementById("records-empty").hidden = hasRecords;
  document.querySelector(".records-filter").hidden = !hasRecords;
  document.querySelector(".records-list-card").hidden = !hasRecords;
  if (hasRecords && !rows.length) {
    box.innerHTML = `<div class="records-filter-empty">${search ? "검색어와 맞는 기록이 없어요." : "선택한 감정에 맞는 기록이 없어요."}</div>`;
  } else {
    rows.slice(0, 200).forEach((record) => box.appendChild(createRecordRow(record, "records")));
  }
  refreshInteractions();
}
async function deleteRecordWithConfirm(record) {
  if (!record?.id) return;
  if (!window.confirm(`“${record.title}” 기록을 삭제할까요?\n삭제한 기록은 되돌릴 수 없어요.`)) return;
  state.selectedRecordId = record.id;
  await deleteCurrentRecord({ confirmed: true });
}

/* ---------- Shared analysis helpers ---------- */
const KO_PARTICLES = ["에서는", "에게서", "으로는", "까지는", "이라는", "에서", "에게", "으로", "까지", "부터", "처럼", "보다", "이랑", "이나", "라고", "한테", "은", "는", "이", "가", "을", "를", "에", "의", "도", "와", "과", "로", "만", "랑"];
const KO_STOPWORDS = new Set(["오늘", "오늘은", "오늘도", "그리고", "하지만", "그래서", "그런데", "정말", "너무", "조금", "많이", "아주", "진짜", "그냥", "다시", "이런", "그런", "저런", "같은", "때문", "하루", "우리", "나는", "내가", "나의", "자신", "생각", "마음", "느낌", "시간", "하나", "이번", "지금", "모두", "가장", "계속", "함께", "있는", "없는", "하는", "했던", "되는", "것을", "것이", "것은", "것들", "수가", "제목", "기록", "드디어", "천천히", "오랜만에", "하루 종일"]);
function stripParticle(word) {
  let result = word;
  for (const particle of KO_PARTICLES) {
    if (result.endsWith(particle) && result.length - particle.length >= 2) {
      result = result.slice(0, -particle.length);
      break;
    }
  }
  if (result.endsWith("들") && result.length >= 3) result = result.slice(0, -1);
  return result;
}
function extractKeywords(records, limit = 8) {
  const counts = new Map();
  for (const record of records) {
    const text = `${record.title} ${record.body}`.replace(/[^\p{L}\p{N}\s]/gu, " ");
    for (const raw of text.split(/\s+/)) {
      const word = stripParticle(raw.trim());
      if (word.length < 2 || word.length > 8) continue;
      if (/^\d+$/.test(word) || KO_STOPWORDS.has(word)) continue;
      if (/[다요죠네고서며게면지만]$/.test(word)) continue;
      if (word.length === 2 && /[에의도를을은는]$/.test(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, limit);
}
function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(monthKey, amount) {
  const [y, m] = monthKey.split("-").map(Number);
  return monthKeyOf(new Date(y, m - 1 + amount, 1, 12));
}
function moodCounts(records) {
  const counts = new Map();
  for (const record of records) {
    const mood = parseMoodLabel(record.mood);
    if (mood) counts.set(mood, (counts.get(mood) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
function renderLineChart(container, points) {
  if (!container) return;
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const width = 300;
  const height = 110;
  const step = width / Math.max(1, points.length);
  const coords = points.map((p, i) => [Math.round((i + 0.5) * step * 10) / 10, Math.round((height - 12 - (p.value / max) * (height - 30)) * 10) / 10]);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0]} ${height} L${coords[0][0]} ${height} Z`;
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${width}" y1="${height * f}" y2="${height * f}" stroke="var(--line-soft)" stroke-dasharray="3 4"/>`).join("");
  const dots = coords.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === coords.length - 1 ? 4.5 : 3.5}" fill="var(--surface)" stroke="#5f7c66" stroke-width="2"><title>${escapeHtml(points[i].label)} · ${points[i].value}편</title></circle>`).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(points.map((p) => `${p.label} ${p.value}편`).join(", "))}">
      <defs><linearGradient id="${container.id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86a08b" stop-opacity=".22"/><stop offset="1" stop-color="#86a08b" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#${container.id}-fill)"/>
      <path d="${line}" fill="none" stroke="#5f7c66" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      ${dots}
    </svg>
    <div class="chart-labels">${points.map((p) => `<span>${escapeHtml(p.label)}</span>`).join("")}</div>`;
}

/* ---------- Analysis page ---------- */
function analysisRecords() {
  const period = document.getElementById("analysis-period")?.value || "3";
  if (period === "all") return state.records;
  const months = Number(period) || 3;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffKey = toDateKey(cutoff);
  return state.records.filter((record) => recordDateKey(record) >= cutoffKey);
}
function renderRecordsStats() {
  const records = analysisRecords();
  const stats = calculateDiaryStats(statsEntries(records));
  const [title, copy] = insightForStats(stats, "전체");
  const titleEl = document.getElementById("records-insight-title");
  const copyEl = document.getElementById("records-insight-copy");
  if (stats.recordCount) {
    const adjective = MOOD_ADJECTIVES[stats.dominantMood] || `${stats.dominantMood}한`;
    titleEl.innerHTML = `<em>${escapeHtml(adjective)} 마음</em>이 가장 많이 머물렀어요`;
    const ranked = moodCounts(records);
    const share = Math.round((ranked[0][1] / records.length) * 100);
    const second = ranked[1] ? ` 그다음으로는 ‘${ranked[1][0]}’의 순간이 자주 기록됐어요.` : "";
    copyEl.textContent = `${records.length}편의 기록 중 ‘${stats.dominantMood}’ 감정이 ${share}%를 차지했어요.${second}`;
  } else {
    titleEl.textContent = title;
    copyEl.textContent = copy;
  }
  document.getElementById("analysis-total").innerHTML = `${stats.recordCount}<small>편</small>`;
  document.getElementById("records-days-written").textContent = `${stats.daysWritten}일`;
  document.getElementById("records-longest-streak").textContent = `${stats.longestStreak}일`;
  renderMoodDistribution(
    document.getElementById("records-distribution-bar"),
    document.getElementById("records-distribution-legend"),
    stats.distribution,
    5
  );
  return { records, stats };
}
function renderMoodTracker() {
  const todayMonth = monthKeyOf(new Date());
  if (!state.trackerMonth || state.trackerMonth > todayMonth) state.trackerMonth = todayMonth;
  const monthKey = state.trackerMonth;
  const [year, month] = monthKey.split("-").map(Number);
  document.getElementById("tracker-title").textContent = `${month}월의 감정 캘린더`;
  const latestByDate = {};
  for (const record of state.records) {
    const key = recordDateKey(record);
    if (!key.startsWith(monthKey)) continue;
    if (!latestByDate[key] || String(record.createdAt || "") > String(latestByDate[key].createdAt || "")) latestByDate[key] = record;
  }
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKey = diaryEntryDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push('<span aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${monthKey}-${String(day).padStart(2, "0")}`;
    const record = latestByDate[key];
    const today = key === todayKey ? " is-today" : "";
    if (record) {
      const mood = parseMoodLabel(record.mood);
      cells.push(`<button type="button" class="recorded${today}" data-record-id="${escapeHtml(record.id)}" style="--mood-dot:${moodColor(mood)};--mood-tint:${moodTint(mood)}" aria-label="${month}월 ${day}일 ${escapeHtml(mood)} 기록 보기"><i aria-hidden="true">${moodToEmoji(record.mood)}</i><small>${day}</small></button>`);
    } else {
      cells.push(`<span class="${today.trim()}"><i>${day}</i><small></small></span>`);
    }
  }
  const days = document.getElementById("tracker-days");
  days.innerHTML = cells.join("");
  const monthMoods = moodCounts(Object.values(latestByDate)).map(([mood]) => mood);
  const legendMoods = monthMoods.length ? monthMoods : emotionOptions.slice(0, 6).map((e) => e.id);
  document.getElementById("tracker-legend").innerHTML = legendMoods
    .map((mood) => `<span><i style="--mood-dot:${moodColor(mood)}"></i>${escapeHtml(mood)}</span>`)
    .join("");
  const earliest = state.records.map(recordDateKey).filter(Boolean).sort()[0];
  document.getElementById("tracker-prev").disabled = !earliest || monthKey <= earliest.slice(0, 7);
  document.getElementById("tracker-next").disabled = monthKey >= todayMonth;
}
function renderAnalysis() {
  const { records } = renderRecordsStats();
  renderMoodTracker();
  const ranked = moodCounts(records);
  const total = records.length;
  const donut = document.getElementById("analysis-donut");
  document.getElementById("analysis-donut-count").textContent = String(total);
  if (total) {
    let acc = 0;
    const stops = ranked.map(([mood, count]) => {
      const start = acc;
      acc += (count / total) * 100;
      return `${moodColor(mood)} ${start.toFixed(2)}% ${acc.toFixed(2)}%`;
    });
    donut.style.background = `conic-gradient(${stops.join(",")})`;
    donut.setAttribute("aria-label", ranked.map(([mood, count]) => `${mood} ${Math.round((count / total) * 100)}%`).join(", "));
    donut.setAttribute("role", "img");
  } else {
    donut.style.background = "";
    donut.removeAttribute("role");
    donut.removeAttribute("aria-label");
  }
  document.getElementById("analysis-donut-legend").innerHTML = total
    ? ranked.slice(0, 6).map(([mood, count]) => `<div><i style="background:${moodColor(mood)}"></i><span>${escapeHtml(mood)}</span><b>${Math.round((count / total) * 100)}%</b></div>`).join("")
    : "<p>기록이 쌓이면 감정의 구성을 보여드려요.</p>";

  const currentMonth = monthKeyOf(new Date());
  const points = [];
  for (let i = 5; i >= 0; i -= 1) {
    const key = shiftMonth(currentMonth, -i);
    points.push({
      label: `${Number(key.slice(5))}월`,
      value: state.records.filter((record) => recordDateKey(record).startsWith(key)).length,
    });
  }
  renderLineChart(document.getElementById("analysis-trend"), points);
  const last = points[points.length - 1].value;
  const prev = points[points.length - 2].value;
  const caption = document.getElementById("analysis-trend-caption");
  if (!state.records.length) caption.textContent = "기록이 쌓이면 흐름을 보여드려요.";
  else if (last > prev) caption.textContent = `지난달보다 ${last - prev}편 더 기록했어요. 마음을 살피는 시간이 늘었어요.`;
  else if (last < prev) caption.textContent = `이번 달은 지난달보다 ${prev - last}편 적어요. 짧은 한 줄도 충분해요.`;
  else caption.textContent = "지난달과 비슷한 속도로 꾸준히 기록하고 있어요.";

  const keywords = extractKeywords(records, 8);
  const cloud = document.getElementById("analysis-keywords");
  cloud.innerHTML = keywords.length
    ? keywords.map(([word], index) => `<span class="word-${Math.min(3, Math.floor(index / 2))}">${escapeHtml(word)}</span>`).join("")
    : '<span class="word-empty">기록 속 단어가 모이면 이곳에 피어나요.</span>';
}

/* ---------- Report page ---------- */
const MONTH_HANJA = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const REFLECTION_BY_MOOD = Object.freeze({
  행복: ["작은 기쁨을 놓치지 않고 붙잡은 시간", "웃음이 머문 순간들이 당신을 단단하게 채워 주었어요.", "“나를 웃게 한 장면을 다음에도 만들 수 있다면, 무엇부터 할까요?”"],
  평온: ["서두르지 않고, 나만의 속도를 찾아간 시간", "일상 속 작은 쉼을 자주 발견하며 마음의 균형을 지켜냈어요.", "“내가 지켜낸 나만의 속도는 어떤 모습이었나요?”"],
  설렘: ["새로운 시작 앞에서 마음이 반짝인 시간", "기대와 호기심이 기록 곳곳에 피어났어요.", "“설렘을 오래 간직하려면 무엇이 필요할까요?”"],
  차분: ["한 걸음 물러서 나를 바라본 시간", "조용히 생각을 정리하며 스스로를 이해하려 애썼어요.", "“차분해진 마음으로 다시 보고 싶은 장면은 무엇인가요?”"],
  지침: ["애쓴 만큼 쉼이 필요했던 시간", "지친 날에도 기록을 남긴 당신은 이미 충분히 잘하고 있어요.", "“다음 주의 나에게 허락하고 싶은 쉼은 무엇인가요?”"],
  감사: ["고마운 마음을 자주 발견한 시간", "주변의 다정함을 알아보는 눈이 기록을 따뜻하게 채웠어요.", "“가장 고마웠던 사람에게 어떤 말을 건네고 싶나요?”"],
  슬픔: ["마음이 조금 무거웠던 시간", "슬픔을 외면하지 않고 적어 내려간 것만으로도 큰 용기였어요.", "“지금의 나를 위로해 줄 수 있는 작은 일은 무엇일까요?”"],
  분노: ["마음속 목소리가 커졌던 시간", "불편한 감정도 솔직하게 기록하며 나를 지켜냈어요.", "“그 감정은 나에게 무엇이 중요하다고 말하고 있었나요?”"],
  불안: ["흔들리면서도 다음 걸음을 찾은 시간", "불안한 날의 기록에서도 스스로를 다독이는 문장이 함께 보였어요.", "“불안할 때 나를 붙잡아 준 것은 무엇이었나요?”"],
  자신: ["나를 믿는 마음이 자라난 시간", "해낸 일들을 차곡차곡 쌓으며 스스로에게 확신을 주었어요.", "“이 자신감을 다음 도전에 어떻게 이어 갈까요?”"],
});
function reportPeriodOptions(mode) {
  const keys = state.records.map(recordDateKey).filter(Boolean);
  const set = new Set(keys.map((key) => (mode === "year" ? key.slice(0, 4) : key.slice(0, 7))));
  set.add(mode === "year" ? String(new Date().getFullYear()) : monthKeyOf(new Date()));
  return [...set].sort().reverse();
}
function formatReportKey(key, mode) {
  if (mode === "year") return `${key}년`;
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}
function renderReport() {
  const mode = state.reportMode;
  const options = reportPeriodOptions(mode);
  if (!options.includes(state.reportKey)) state.reportKey = options[0];
  const key = state.reportKey;
  const select = document.getElementById("report-period");
  select.innerHTML = options.map((option) => `<option value="${option}">${formatReportKey(option, mode)}</option>`).join("");
  select.value = key;
  document.querySelectorAll("[data-report-mode]").forEach((button) => {
    const active = button.dataset.reportMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const isYear = mode === "year";
  document.getElementById("report-eyebrow").textContent = isYear ? "한 해의 마음을 천천히" : "한 달의 마음을 천천히";
  document.getElementById("report-heading").textContent = isYear ? "연간 회고 리포트" : "월간 회고 리포트";

  const records = state.records.filter((record) => recordDateKey(record).startsWith(key));
  const stats = calculateDiaryStats(statsEntries(records));
  const ranked = moodCounts(records);
  const topMood = ranked[0]?.[0] || "";
  const reflection = REFLECTION_BY_MOOD[topMood];
  const label = formatReportKey(key, mode);

  document.getElementById("report-hero-label").textContent = `${label} ${isYear ? "YEARLY" : "MONTHLY"} REFLECTION`;
  const seal = document.getElementById("report-seal");
  seal.textContent = isYear ? key.slice(2) + "年" : MONTH_HANJA[Number(key.slice(5)) - 1];
  seal.classList.toggle("is-long", seal.textContent.length > 2);
  const heroTitle = document.getElementById("report-hero-title");
  const heroCopy = document.getElementById("report-hero-copy");
  if (records.length) {
    heroTitle.textContent = reflection ? reflection[0] : `${topMood}의 마음이 머문 시간`;
    const keywords = extractKeywords(records, 2).map(([word]) => `‘${word}’`);
    heroCopy.textContent = keywords.length
      ? `${keywords.join("과 ")}에 관한 이야기를 자주 남겼어요.`
      : `${records.length}편의 기록이 이 시기를 채웠어요.`;
  } else {
    heroTitle.innerHTML = "첫 기록이 이 시기의<br>이야기를 열어 줄 거예요";
    heroCopy.textContent = "작은 한 줄도 충분해요.";
  }

  const prevKey = isYear ? String(Number(key) - 1) : shiftMonth(key, -1);
  const prevCount = state.records.filter((record) => recordDateKey(record).startsWith(prevKey)).length;
  document.getElementById("report-total").innerHTML = `${records.length}<small>회</small>`;
  const diff = records.length - prevCount;
  document.getElementById("report-total-diff").textContent = !records.length
    ? "기록을 시작해 보세요"
    : diff > 0 ? `지난${isYear ? "해" : "달"}보다 ${diff}회 늘었어요` : diff < 0 ? `지난${isYear ? "해" : "달"}보다 ${-diff}회 적어요` : `지난${isYear ? "해" : "달"}와 같아요`;
  document.getElementById("report-top-mood").innerHTML = topMood ? emotionBadgeHtml(topMood) : '<span class="neutral-pill">—</span>';
  document.getElementById("report-top-mood-share").textContent = topMood
    ? `전체 기록의 ${Math.round((ranked[0][1] / records.length) * 100)}%`
    : "아직 없어요";
  document.getElementById("report-days").innerHTML = `${stats.daysWritten}<small>일</small>`;
  document.getElementById("report-streak").innerHTML = `${stats.longestStreak}<small>일</small>`;

  const points = [];
  if (isYear) {
    for (let m = 1; m <= 12; m += 1) {
      const monthKey = `${key}-${String(m).padStart(2, "0")}`;
      points.push({ label: `${m}`, value: records.filter((r) => recordDateKey(r).startsWith(monthKey)).length });
    }
  } else {
    const [y, m] = key.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const weeks = Math.ceil(daysInMonth / 7);
    for (let w = 0; w < weeks; w += 1) {
      const from = w * 7 + 1;
      const to = Math.min(daysInMonth, from + 6);
      points.push({
        label: `${w + 1}주`,
        value: records.filter((r) => {
          const d = Number(recordDateKey(r).slice(8, 10));
          return d >= from && d <= to;
        }).length,
      });
    }
  }
  document.getElementById("report-trend-kicker").textContent = isYear ? "올해의 흐름" : "이번 달의 흐름";
  renderLineChart(document.getElementById("report-trend"), points);

  const keywords = extractKeywords(records, 5);
  const maxCount = keywords[0]?.[1] || 1;
  document.getElementById("report-keywords").innerHTML = keywords.length
    ? keywords.map(([word, count], index) => `<div><span>${index + 1}</span><b>${escapeHtml(word)}</b><div><i style="width:${Math.round((count / maxCount) * 100)}%"></i></div><em>${count}회</em></div>`).join("")
    : '<p class="caption">기록이 쌓이면 자주 쓴 단어를 모아 드려요.</p>';

  const memory = document.getElementById("report-memory");
  const memorable = [...records].sort((a, b) => (b.summary || b.body).length - (a.summary || a.body).length)[0];
  if (memorable) {
    const quote = (memorable.summary || memorable.body).replace(/^[“"]|[”"]$/g, "").slice(0, 90);
    memory.innerHTML = `“${escapeHtml(quote)}”<span>${escapeHtml(formatEntryDate(memorable))} · ${escapeHtml(memorable.title)}</span>`;
  } else {
    memory.textContent = "기록이 쌓이면 다시 꺼내 보고 싶은 문장을 골라 드려요.";
  }

  const events = document.getElementById("report-events");
  events.innerHTML = "";
  if (!records.length) {
    events.innerHTML = "<p>이 시기의 기록이 아직 없어요.</p>";
  } else {
    records.slice(0, 4).forEach((record) => {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<i aria-hidden="true"></i><span>${escapeHtml(record.title)}</span><small>${escapeHtml(formatEntryDate(record))}</small>`;
      button.addEventListener("click", () => openRecordDetail(record, "records"));
      events.appendChild(button);
    });
  }

  document.getElementById("report-reflection-title").textContent = records.length
    ? `이 시기의 당신은 ${reflection ? reflection[1] : `‘${topMood}’의 마음을 자주 기록했어요.`}`
    : "기록이 모이면 이 시기를 다정하게 돌아봐 드릴게요.";
  document.getElementById("report-reflection-copy").textContent = records.length
    ? `${stats.daysWritten}일 동안 ${records.length}편의 마음을 남겼어요. 완벽하게 해내는 것보다 꾸준히 나를 들여다본 시간이 더 소중해요.`
    : "완벽하지 않아도 괜찮아요. 오늘의 한 줄이 내일의 나를 이해하는 단서가 됩니다.";
  document.getElementById("report-question").textContent = reflection ? reflection[2] : "“지금 내 마음은 어떤 속도로 걷고 있나요?”";
}
async function reloadRecords() {
  const uid = state.auth?.uid;
  if (uid && !state.auth?.isAdmin) {
    const snapshots = await getDocs(query(userDiariesRef(uid), orderBy("createdAt", "desc")));
    state.records = snapshots.docs.map(recordFromFirestore);
    state.recordsSource = "firestore";
    cacheRecords(uid, state.records);
  } else {
    state.records = await callWorker("list");
    state.recordsSource = "local";
  }
  for (const record of state.records) {
    if (!record.entryDate && record.createdAt) {
      record.entryDate = toDateKey(new Date(record.createdAt));
    }
  }
  renderRecordsUI();
}
function renderRecordsUI() {
  renderHomeRecords();
  renderAnalysis();
  renderRecordsPage();
  renderPromptRecommendations();
  updateDiaryStatsUI();
  if (currentPageId() === "report") renderReport();
}
async function deleteCurrentRecord({ confirmed = false } = {}) {
  if (!state.selectedRecordId) return;
  if (!confirmed && !window.confirm("이 기록을 삭제할까요?\n삭제한 기록은 되돌릴 수 없어요.")) return;
  try {
    const uid = state.auth?.uid;
    if (uid && !state.auth?.isAdmin) {
      await deleteDoc(doc(userDiariesRef(uid), String(state.selectedRecordId)));
    } else {
      const result = await callWorker("delete", { id: state.selectedRecordId });
      persistSerialized(result);
    }
    state.selectedRecordId = null;
    await reloadRecords();
    showToast("기록을 삭제했어요.");
    if (currentPageId() !== "records") go("records");
  } catch (error) {
    console.error("일기 삭제 실패", error);
    showToast("기록을 삭제하지 못했어요.");
  }
}
function goBackFromRecordDetail() {
  go(state.recordDetailReturnPage === "home" ? "home" : "records");
}

function clearAuthFeedback(form) {
  if (!form) return;
  form.querySelectorAll("[aria-invalid='true']").forEach((input) => input.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field-error,.form-error").forEach((message) => {
    message.textContent = "";
    message.hidden = true;
  });
}
function setAuthFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(`${fieldId}-error`);
  if (field) {
    field.setAttribute("aria-invalid", "true");
    requestAnimationFrame(() => field.focus({ preventScroll: true }));
  }
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
  showToast(message);
  return false;
}
function setAuthFormError(formId, message) {
  const error = document.getElementById(`${formId}-error`);
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
  showToast(message);
}
function setAuthButtonPending(button, pending, pendingLabel = "처리 중…") {
  if (!button) return;
  const label = button.querySelector("[data-button-label]");
  if (label && !button.dataset.defaultLabel) button.dataset.defaultLabel = label.textContent.trim();
  if (label) label.textContent = pending ? pendingLabel : button.dataset.defaultLabel;
  button.disabled = pending;
  button.setAttribute("aria-busy", String(pending));
}
function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}
function renderPasswordResetSuccess() {
  const result = document.getElementById("find-reset-result");
  if (!result) return;
  result.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = "요청을 확인했어요.";
  const copy = document.createElement("p");
  copy.textContent = "입력한 이메일이 등록되어 있다면 재설정 링크가 발송됩니다. 받은편지함과 스팸함을 확인해주세요.";
  result.append(title, copy);
  result.hidden = false;
}
function updatePasswordResetCooldown() {
  const button = document.getElementById("password-reset-submit");
  if (!button) return;
  const label = button.querySelector("[data-button-label]");
  const remaining = Math.ceil((passwordResetCooldownUntil - Date.now()) / 1000);
  if (remaining > 0) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    if (label) label.textContent = `다시 보내기 (${remaining}초)`;
    return;
  }
  clearInterval(passwordResetCooldownTimer);
  passwordResetCooldownTimer = null;
  button.disabled = false;
  button.removeAttribute("aria-disabled");
  if (label) label.textContent = button.dataset.defaultLabel || "재설정 메일 보내기";
}
function startPasswordResetCooldown() {
  passwordResetCooldownUntil = Date.now() + PASSWORD_RESET_COOLDOWN_MS;
  clearInterval(passwordResetCooldownTimer);
  updatePasswordResetCooldown();
  passwordResetCooldownTimer = setInterval(updatePasswordResetCooldown, 1000);
}

async function loginAsAdmin(username, password) {
  const data = await apiPost("/api/admin/login", { username, password });
  state.admin = { token: data.token, username: data.username };
  sessionStorage.setItem("handam-admin", JSON.stringify(state.admin));
  state.auth = { uid: "admin", email: null, isAdmin: true };
  showToast("관리자 로그인 성공");
  go("admin");
}
async function login(event) {
  event?.preventDefault();
  const form = document.getElementById("login-form");
  const submit = form?.querySelector("[type='submit']");
  if (submit?.disabled) return;
  clearAuthFeedback(form);
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email) return setAuthFieldError("login-email", "이메일 또는 관리자 아이디를 입력해주세요.");
  if (email.includes("@") && !isEmailAddress(email)) return setAuthFieldError("login-email", "이메일 형식을 확인해주세요.");
  if (!password) return setAuthFieldError("login-password", "비밀번호를 입력해주세요.");
  setAuthButtonPending(submit, true, "로그인 중…");

  try {
    if (!email.includes("@")) {
      await loginAsAdmin(email, password);
      return;
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await setAuthFromUser(credential.user);
    showToast("로그인 성공");
    go("home");
  } catch (error) {
    const message = email.includes("@")
      ? authErrorMessage(error, { flow: "login" })
      : error?.message || "관리자 로그인에 실패했어요.";
    setAuthFormError("login-form", message);
  } finally {
    setAuthButtonPending(submit, false);
  }
}
async function registerFromSignup(event) {
  event?.preventDefault();
  const form = document.getElementById("signup-form");
  const submit = form?.querySelector("[type='submit']");
  if (submit?.disabled) return;
  clearAuthFeedback(form);
  const displayName = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-password-confirm").value;
  if (!displayName) return setAuthFieldError("signup-name", "이름을 입력해주세요.");
  if (!email) return setAuthFieldError("signup-email", "이메일을 입력해주세요.");
  if (!isEmailAddress(email)) return setAuthFieldError("signup-email", "이메일 형식을 확인해주세요.");
  if (!password || password.length < 6) return setAuthFieldError("signup-password", "비밀번호는 6자 이상이어야 해요.");
  if (password !== confirm) return setAuthFieldError("signup-password-confirm", "비밀번호 확인이 일치하지 않아요.");
  setAuthButtonPending(submit, true, "가입 중…");
  pendingSignupProfile = { displayName, email: email.toLowerCase() };
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    saveProfile(credential.user.uid, { displayName, email });
    let profileSyncFailed = false;
    try {
      await updateProfile(credential.user, { displayName });
    } catch (_error) {
      profileSyncFailed = true;
    }
    await setAuthFromUser(credential.user, { profileOverride: pendingSignupProfile });
    showToast(profileSyncFailed ? "가입을 완료했어요. 표시 이름은 계정 데이터에 안전하게 저장했어요." : `${displayName}님, 가입을 환영해요!`);
    go("home");
  } catch (error) {
    setAuthFormError("signup-form", authErrorMessage(error, { flow: "signup" }));
  } finally {
    pendingSignupProfile = null;
    setAuthButtonPending(submit, false);
  }
}
async function sendPasswordReset(event) {
  event?.preventDefault();
  const form = document.getElementById("password-reset-form");
  const submit = document.getElementById("password-reset-submit");
  if (submit?.disabled || Date.now() < passwordResetCooldownUntil) return;
  clearAuthFeedback(form);
  const email = document.getElementById("find-email").value.trim();
  if (!email) return setAuthFieldError("find-email", "가입 시 사용한 이메일을 입력해주세요.");
  if (!isEmailAddress(email)) return setAuthFieldError("find-email", "이메일 형식을 확인해주세요.");
  const result = document.getElementById("find-reset-result");
  if (result) result.hidden = true;
  setAuthButtonPending(submit, true, "요청 중…");
  let shouldCooldown = false;
  try {
    await sendPasswordResetEmail(auth, email, {
      url: getAppPublicUrl() + "/",
      handleCodeInApp: false,
    });
    shouldCooldown = true;
    renderPasswordResetSuccess();
    showToast("요청을 확인했어요. 받은편지함과 스팸함을 확인해주세요.");
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      shouldCooldown = true;
      renderPasswordResetSuccess();
      showToast("요청을 확인했어요. 받은편지함과 스팸함을 확인해주세요.");
    } else {
      setAuthFormError("password-reset-form", authErrorMessage(error, { flow: "reset" }));
    }
  } finally {
    setAuthButtonPending(submit, false);
    if (shouldCooldown) startPasswordResetCooldown();
  }
}
function showFindHint() {
  const hint = document.getElementById("find-id-result");
  const clearButton = document.getElementById("find-id-clear");
  const accounts = loadLastAccounts();
  hint.replaceChildren();
  if (!accounts.length) {
    hint.textContent = "이 기기에 저장된 계정 기록이 없어요. 가입 이메일을 알고 있다면 비밀번호 찾기를 이용해주세요.";
    hint.hidden = false;
    if (clearButton) clearButton.hidden = true;
    return;
  }
  const title = document.createElement("strong");
  title.textContent = "최근 사용한 계정";
  const list = document.createElement("ul");
  list.className = "auth-account-list";
  accounts.forEach((account) => {
    const item = document.createElement("li");
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-user";
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = account.maskedEmail;
    item.append(icon, text);
    list.appendChild(item);
  });
  hint.append(title, list);
  hint.hidden = false;
  if (clearButton) clearButton.hidden = false;
}
function clearFindHints() {
  localStorage.removeItem(LAST_ACCOUNTS_KEY);
  showFindHint();
  showToast("이 기기의 계정 기록을 지웠어요.");
}
async function loginWithGoogle() {
  const button = document.getElementById("google-login-button");
  if (button?.disabled) return;
  setAuthButtonPending(button, true, "Google 로그인 중…");
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const user = credential.user;
    if (user.displayName) saveProfile(user.uid, { displayName: user.displayName, email: user.email });
    await setAuthFromUser(user);
    showToast(`${getDisplayName()}님, 환영해요!`);
    go("home");
  } catch (error) {
    setAuthFormError("login-form", authErrorMessage(error, { flow: "login" }));
  } finally {
    setAuthButtonPending(button, false);
  }
}
async function logout() {
  try {
    if (state.auth && !state.auth.isAdmin && !state.auth.isLocalAdmin) {
      await signOut(auth);
    }
  } catch (_error) {}
  state.auth = null;
  state.profile = null;
  state.admin = null;
  state.settings = normalizeUserSettings();
  state.records = [];
  state.recordsSource = "none";
  cloudLoadUid = null;
  cloudLoadPromise = null;
  localStorage.removeItem("handam-auth");
  sessionStorage.removeItem("handam-admin");
  stopPresenceHeartbeat();
  renderRecordsUI();
  updateUserUI();
  showToast("로그아웃했어요.");
  go("login");
}
function adminLogout(message) {
  window.handamAdminPending = undefined;
  window.handamAdmin?.unmount();
  state.admin = null;
  state.auth = null;
  state.profile = null;
  state.settings = normalizeUserSettings();
  state.records = [];
  state.recordsSource = "none";
  cloudLoadUid = null;
  cloudLoadPromise = null;
  stopPresenceHeartbeat();
  sessionStorage.removeItem("handam-admin");
  void signOut(auth).catch(() => {});
  go("login");
  showToast(typeof message === "string" ? message : "관리자 로그아웃했어요.");
}
async function changePassword() {
  const currentPassword = document.getElementById("password-current").value.trim();
  const nextPassword = document.getElementById("password-next").value.trim();
  const confirmPassword = document.getElementById("password-next-confirm").value.trim();
  if (!state.auth?.idToken) return showToast("로그인 상태가 필요해요.");
  if (!currentPassword || !nextPassword || !confirmPassword) return showToast("모든 비밀번호 항목을 입력해주세요.");
  if (nextPassword !== confirmPassword) return showToast("새 비밀번호 확인이 일치하지 않아요.");
  try {
    if (state.auth.email === "admin@local.test") {
      showToast("테스트 계정은 비밀번호 변경을 건너뜁니다.");
      return;
    }
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error("세션이 만료되었어요. 다시 로그인해주세요.");
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, nextPassword);
    const idToken = await user.getIdToken(true);
    state.auth = { uid: user.uid, email: user.email, idToken };
    showToast("비밀번호를 변경했어요.");
  } catch (error) { showToast(error.message || "비밀번호 변경에 실패했어요."); }
}
async function exportDiaries() {
  const payload = { exportedAt: new Date().toISOString(), user: state.auth?.email || null, total: state.records.length, records: state.records };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = `handam-backup-${Date.now()}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  showToast("일기 JSON 내보내기를 완료했어요.");
}

const FORTUNE_BIRTHDAY_KEY = "handam-fortune-birthday";
const FALLBACK_LUCKY_COLORS = [
  { name: "스카이 블루", hex: "#7FB7D9" },
  { name: "코랄 핑크", hex: "#F4A5A0" },
];
const FALLBACK_TOTAL_TIERS = [
  { min: 75, label: "좋음", messages: ["오늘도 좋은 하루 되세요."] },
  { min: 0, label: "보통", messages: ["차분히 하루를 보내세요."] },
];

function fortuneHash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}
function fortuneSeed(base, salt) {
  return fortuneHash(`${base}|${salt}`);
}
function fortunePick(list, seed) {
  return list[seed % list.length];
}
function fortuneScore(seed, min = 55, max = 99) {
  return min + (seed % (max - min + 1));
}
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseBirthday(birthday) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthday || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}
function getWesternZodiac(month, day) {
  const md = month * 100 + day;
  if (md >= 321 && md <= 419) return "양자리";
  if (md >= 420 && md <= 520) return "황소자리";
  if (md >= 521 && md <= 620) return "쌍둥이자리";
  if (md >= 621 && md <= 722) return "게자리";
  if (md >= 723 && md <= 822) return "사자자리";
  if (md >= 823 && md <= 922) return "처녀자리";
  if (md >= 923 && md <= 1022) return "천칭자리";
  if (md >= 1023 && md <= 1121) return "전갈자리";
  if (md >= 1122 && md <= 1221) return "사수자리";
  if (md >= 1222 || md <= 119) return "염소자리";
  if (md >= 120 && md <= 218) return "물병자리";
  return "물고기자리";
}
function getChineseZodiac(year) {
  const animals = ["원숭이", "닭", "개", "돼지", "쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양"];
  return `${animals[((year % 12) + 12) % 12]}띠`;
}
function getFortuneTiers() {
  return fortuneData?.totalScore?.tiers?.length ? fortuneData.totalScore.tiers : FALLBACK_TOTAL_TIERS;
}
function getLuckyColors() {
  return fortuneData?.luckyColors?.length ? fortuneData.luckyColors : FALLBACK_LUCKY_COLORS;
}
function fortuneTier(score) {
  const tiers = [...getFortuneTiers()].sort((a, b) => b.min - a.min);
  const tier = tiers.find((t) => score >= t.min) || tiers[tiers.length - 1];
  return { label: tier.label, key: String(tier.min) };
}
function fortuneMessageByScore(categoryKey, score, seed) {
  const ranges = fortuneData?.categories?.[categoryKey]?.ranges;
  if (!ranges?.length) return "";
  const sorted = [...ranges].sort((a, b) => b.min - a.min);
  const range = sorted.find((r) => score >= r.min) || sorted[sorted.length - 1];
  const messages = range.messages || [];
  if (!messages.length) return "";
  return fortunePick(messages, seed);
}
function calculateFortune(birthday, today = new Date()) {
  const parsed = parseBirthday(birthday);
  if (!parsed) return null;
  const dateKey = formatDateKey(today);
  const zodiac = getWesternZodiac(parsed.month, parsed.day);
  const chinese = getChineseZodiac(parsed.year);
  const base = `${birthday}|${dateKey}|${zodiac}|${chinese}`;
  const totalSeed = fortuneSeed(base, "total");
  const zodiacBoost = fortuneSeed(zodiac, dateKey) % 7;
  const ageBoost = (today.getFullYear() - parsed.year) % 5;
  const scoreMin = fortuneData?.totalScore?.min ?? 52;
  const scoreMax = fortuneData?.totalScore?.max ?? 98;
  const total = Math.max(1, Math.min(100, fortuneScore(totalSeed, scoreMin, scoreMax) + zodiacBoost - 2 + ageBoost));
  const tier = fortuneTier(total);
  const luckyColors = getLuckyColors();
  const color = fortunePick(luckyColors, fortuneSeed(base, "color"));
  const numA = 1 + (fortuneSeed(base, "numA") % 9);
  const numB = 10 + (fortuneSeed(base, "numB") % 90);
  const tiers = [...getFortuneTiers()].sort((a, b) => b.min - a.min);
  const totalTier = tiers.find((t) => total >= t.min) || tiers[tiers.length - 1];
  const catCfg = fortuneData?.categories || {};
  const loveScore = fortuneScore(
    fortuneSeed(base, "love"),
    catCfg.love?.min ?? 50,
    catCfg.love?.max ?? 99
  );
  const moneyScore = fortuneScore(
    fortuneSeed(base, "money"),
    catCfg.money?.min ?? 48,
    catCfg.money?.max ?? 97
  );
  const workScore = fortuneScore(
    fortuneSeed(base, "work"),
    catCfg.work?.min ?? 52,
    catCfg.work?.max ?? 99
  );
  return {
    total,
    tier: { label: totalTier.label, key: String(totalTier.min) },
    zodiac,
    chinese,
    color,
    numbers: [numA, numB],
    quote: fortunePick(totalTier.messages || [], fortuneSeed(base, "quote")),
    love: {
      score: loveScore,
      text: fortuneMessageByScore("love", loveScore, fortuneSeed(base, "loveText")),
    },
    money: {
      score: moneyScore,
      text: fortuneMessageByScore("money", moneyScore, fortuneSeed(base, "moneyText")),
    },
    work: {
      score: workScore,
      text: fortuneMessageByScore("work", workScore, fortuneSeed(base, "workText")),
    },
  };
}
function loadFortuneBirthday() {
  try { return localStorage.getItem(FORTUNE_BIRTHDAY_KEY) || null; } catch (_e) { return null; }
}
function saveFortuneBirthday(birthday) {
  localStorage.setItem(FORTUNE_BIRTHDAY_KEY, birthday);
  state.fortuneBirthday = birthday;
  if (state.settings) saveSettingsPatch({ fortuneBirthday: birthday }).catch(() => {});
}
function refreshFortune() {
  if (!state.fortuneBirthday) {
    state.fortune = null;
    return;
  }
  state.fortune = calculateFortune(state.fortuneBirthday);
}
function setAdviceRow(scoreId, textId, barId, data) {
  const scoreEl = document.getElementById(scoreId);
  const textEl = document.getElementById(textId);
  const barEl = document.getElementById(barId);
  if (!scoreEl || !textEl || !barEl) return;
  if (!data) {
    scoreEl.textContent = "· —";
    textEl.textContent = "생일을 입력하면 분야별 운세를 볼 수 있어요.";
    barEl.style.width = "0%";
    return;
  }
  scoreEl.textContent = `· ${data.score}`;
  textEl.textContent = data.text;
  barEl.style.width = `${data.score}%`;
}
function applyFortuneLabelsFromJson() {
  if (!fortuneData?.categories) return;
  const pairs = [
    ["love", "fortune-love-title"],
    ["money", "fortune-money-title"],
    ["work", "fortune-work-title"],
  ];
  for (const [key, id] of pairs) {
    const el = document.getElementById(id);
    const label = fortuneData.categories[key]?.label;
    if (el && label) el.textContent = label;
  }
}
const FORTUNE_PROMPTS = [
  "오늘 천천히 바라보고 싶은 것은 무엇인가요?",
  "오늘 나에게 건네고 싶은 다정한 한마디는?",
  "오늘 작은 행운처럼 느껴진 순간은 언제였나요?",
  "지금 내 마음을 가볍게 해 줄 한 가지는 무엇일까요?",
  "오늘 누군가에게 고마웠던 순간이 있었나요?",
];
function fortuneOpenedStorageKey() {
  return `handam-fortune-opened-${state.auth?.uid || "guest"}-${diaryEntryDate()}`;
}
function syncFortuneOpenedState() {
  try {
    state.fortuneOpened = Boolean(state.fortune) && localStorage.getItem(fortuneOpenedStorageKey()) === "1";
  } catch (_error) {
    state.fortuneOpened = false;
  }
}
function markFortuneOpened() {
  state.fortuneOpened = true;
  try { localStorage.setItem(fortuneOpenedStorageKey(), "1"); } catch (_error) {}
}
function stripTags(text) {
  return String(text || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function renderFortuneUI() {
  applyFortuneLabelsFromJson();
  const hasFortune = Boolean(state.fortune);
  const f = state.fortune;
  const opened = hasFortune && state.fortuneOpened;
  const homeQuote = document.getElementById("home-fortune-quote");
  const homeLuckyText = document.getElementById("home-fortune-lucky-text");
  if (homeQuote) homeQuote.textContent = opened ? stripTags(f.quote) : "오늘 내게 찾아올 좋은 기운은?";
  if (homeLuckyText) {
    homeLuckyText.textContent = opened
      ? `총운 ${f.total}점 · 행운의 색 ${f.color.name}`
      : hasFortune ? "한 장의 운세를 열어 보세요" : "생년월일을 입력하고 운세를 열어 보세요";
  }
  document.getElementById("fortune-card")?.classList.toggle("opened", opened);
  const result = document.getElementById("fortune-result");
  if (result) result.hidden = !opened;
  const advice = document.getElementById("fortune-advice");
  if (advice) advice.hidden = !opened;
  const prompt = document.getElementById("fortune-prompt");
  if (prompt) prompt.hidden = !opened;
  const openLabel = document.getElementById("fortune-open-label");
  if (openLabel) openLabel.textContent = hasFortune ? "오늘의 운세 열어보기" : "생년월일 입력하고 열어보기";

  const gaugeLabel = document.getElementById("gauge-label");
  const fortuneQuote = document.getElementById("fortune-quote");
  const gaugeNum = document.getElementById("gauge-num");
  if (gaugeLabel) gaugeLabel.textContent = hasFortune ? `오늘의 한마디 · 총운 ${f.tier.label}` : "오늘의 한마디";
  if (fortuneQuote) fortuneQuote.innerHTML = hasFortune ? f.quote : "생년월일을 바탕으로 오늘의 운세를 계산해 드려요.";
  if (gaugeNum && !hasFortune) gaugeNum.textContent = "—";
  const zodiacEl = document.getElementById("fortune-zodiac");
  const tierEl = document.getElementById("fortune-tier");
  const colorEl = document.getElementById("fortune-lucky-color");
  const swatchEl = document.getElementById("fortune-lucky-swatch");
  const numbersEl = document.getElementById("fortune-lucky-numbers");
  if (zodiacEl) zodiacEl.textContent = hasFortune ? `${f.zodiac} · ${f.chinese}의 오늘을 비추는 한마디예요.` : "—";
  if (tierEl) tierEl.textContent = hasFortune ? f.tier.label : "—";
  if (colorEl) colorEl.textContent = hasFortune ? f.color.name : "—";
  if (swatchEl) swatchEl.style.background = hasFortune ? f.color.hex : "";
  if (numbersEl) numbersEl.textContent = hasFortune ? `${f.numbers[0]} · ${f.numbers[1]}` : "—";
  setAdviceRow("fortune-love-score", "fortune-love-text", "fortune-love-bar", hasFortune ? f.love : null);
  setAdviceRow("fortune-money-score", "fortune-money-text", "fortune-money-bar", hasFortune ? f.money : null);
  setAdviceRow("fortune-work-score", "fortune-work-text", "fortune-work-bar", hasFortune ? f.work : null);
  const promptQuestion = document.getElementById("fortune-prompt-question");
  if (promptQuestion && hasFortune) {
    promptQuestion.textContent = `“${fortunePick(FORTUNE_PROMPTS, fortuneSeed(`${state.fortuneBirthday}|${diaryEntryDate()}`, "prompt"))}”`;
  }
  const birthdayLabel = document.querySelector("#fortune-birthday-btn span");
  if (birthdayLabel) birthdayLabel.textContent = hasFortune ? "생년월일 다시 입력하기" : "생년월일 입력하기";
}
function openTodayFortune() {
  if (!state.fortuneBirthday || !state.fortune) {
    state.pendingFortuneOpen = true;
    openSheet();
    return;
  }
  markFortuneOpened();
  renderFortuneUI();
  setTimeout(animateGauge, getAnimations().fortune?.gaugeDelayMs ?? 160);
}
function fillBirthdaySelects() {
  const y = document.getElementById("fortune-year");
  const m = document.getElementById("fortune-month");
  const d = document.getElementById("fortune-day");
  if (!y || !m || !d) return;
  const saved = parseBirthday(state.fortuneBirthday);
  const now = new Date();
  const currentYear = now.getFullYear();
  y.innerHTML = "";
  m.innerHTML = "";
  d.innerHTML = "";
  for (let year = currentYear; year >= 1950; year -= 1) {
    const opt = document.createElement("option");
    opt.value = String(year);
    opt.textContent = String(year);
    if (saved && year === saved.year) opt.selected = true;
    y.appendChild(opt);
  }
  for (let month = 1; month <= 12; month += 1) {
    const opt = document.createElement("option");
    opt.value = String(month).padStart(2, "0");
    opt.textContent = `${month}월`;
    if (saved && month === saved.month) opt.selected = true;
    m.appendChild(opt);
  }
  for (let day = 1; day <= 31; day += 1) {
    const opt = document.createElement("option");
    opt.value = String(day).padStart(2, "0");
    opt.textContent = `${day}일`;
    if (saved && day === saved.day) opt.selected = true;
    d.appendChild(opt);
  }
  if (!saved) {
    y.value = String(1996);
    m.value = "05";
    d.value = "20";
  }
}
function completeFortuneCalculation() {
  refreshFortune();
  if (state.fortune) markFortuneOpened();
  state.pendingFortuneOpen = false;
  renderFortuneUI();
  showToast("오늘의 운세를 열었어요.");
  setTimeout(animateGauge, getAnimations().fortune?.gaugeInitDelayMs ?? 100);
}
function showFortuneCalculatingLoader(birthday, onDone) {
  const parsed = parseBirthday(birthday);
  if (!parsed) {
    onDone();
    return;
  }
  const westernZodiac = getWesternZodiac(parsed.month, parsed.day);
  const chineseZodiac = getChineseZodiac(parsed.year);
  if (typeof window.handamFortuneLoading?.show === "function") {
    window.handamFortuneLoading.show({
      westernZodiac: String(westernZodiac),
      chineseZodiac: String(chineseZodiac),
      onDone,
    });
    return;
  }
  onDone();
}
function updateFortuneFromBirthday() {
  const birthday = `${document.getElementById("fortune-year").value}-${document.getElementById("fortune-month").value}-${document.getElementById("fortune-day").value}`;
  if (!parseBirthday(birthday)) {
    showToast("올바른 생년월일을 선택해 주세요.");
    return;
  }
  saveFortuneBirthday(birthday);
  closeSheet();
  showFortuneCalculatingLoader(birthday, completeFortuneCalculation);
}
function initFortune() {
  state.fortuneBirthday = currentSettings().fortuneBirthday || loadFortuneBirthday();
  refreshFortune();
  syncFortuneOpenedState();
  renderFortuneUI();
}

let settingsFeedbackRevision = 0;
async function saveSettingsWithFeedback(patch) {
  const revision = ++settingsFeedbackRevision;
  const uid = state.auth?.uid;
  const isCurrent = () => revision === settingsFeedbackRevision && uid === state.auth?.uid;
  try {
    const pending = saveSettingsPatch(patch, { quiet: true });
    showToast(uid ? "이 기기에 적용했어요. 계정에 동기화하고 있어요." : "이 기기에 설정을 적용했어요.");
    await pending;
    if (isCurrent()) showToast(uid ? "설정을 계정에 동기화했어요." : "이 기기에 설정을 저장했어요.");
  } catch (_error) {
    if (isCurrent()) showToast("계정 동기화에 실패했어요. 이 기기의 설정은 유지돼요. 연결을 확인하고 다시 선택해주세요.");
  }
}

function bindSettingsPage() {
  const page = document.getElementById("page-settings");
  page.addEventListener("click", (event) => {
    const button = event.target.closest("[data-settings-action]");
    if (!button || !page.contains(button)) return;
    const action = button.dataset.settingsAction;
    if (action === "theme") toggleTheme(event);
    else if (action === "logout") void logout();
    else if (action === "password" || action === "backup") go(action);
  });
  page.querySelectorAll('[role="radiogroup"]').forEach((group) => {
    group.addEventListener("keydown", (event) => {
      const buttons = [...group.querySelectorAll('[role="radio"]')];
      const index = buttons.indexOf(event.target);
      if (index < 0) return;
      let next;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % buttons.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + buttons.length - 1) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[next].focus();
      buttons[next].click();
    });
  });
}

function bindSegmentButtons() {
  document.querySelectorAll(".seg:not(.seg-elastic):not(#find-tabs)").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      btn.classList.add("on");
      showToast(`${btn.textContent.trim()} 설정을 적용했어요`);
    });
  });
  document.querySelectorAll(".seg-elastic").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const setting = seg.dataset.settingSegment;
      if (setting && btn.dataset.value) {
        void saveSettingsWithFeedback({ [setting]: btn.dataset.value });
      } else {
        showToast(`${btn.textContent.trim()} 설정을 적용했어요`);
      }
    });
  });
}

window.deleteCurrentRecord = deleteCurrentRecord;
window.goBackFromRecordDetail = goBackFromRecordDetail;
window.go = go; window.toggleTheme = toggleTheme; window.toggleSwitch = toggleSwitch;
window.openCameraOCR = openCameraOCR; window.openGalleryOCR = openGalleryOCR; window.resetOCR = resetOCR;
window.refreshPrompts = refreshPrompts; window.startPromptDiary = startPromptDiary; window.openManualDiary = openManualDiary; window.saveManualDiary = saveManualDiary;
window.updateFortuneFromBirthday = updateFortuneFromBirthday; window.logout = logout; window.login = login;
window.loginWithGoogle = loginWithGoogle;
window.registerFromSignup = registerFromSignup;
window.sendPasswordReset = sendPasswordReset;
window.showFindHint = showFindHint;
window.clearFindHints = clearFindHints;
window.adminLogout = adminLogout;
window.changePassword = changePassword; window.exportDiaries = exportDiaries; window.showToast = showToast; window.openSheet = openSheet; window.closeSheet = closeSheet;

function showFindAccountTab(tab, { focus = false } = {}) {
  const selected = tab === "id" ? "id" : "password";
  document.querySelectorAll("[data-find-tab]").forEach((button) => {
    const active = button.dataset.findTab === selected;
    button.classList.toggle("on", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus({ preventScroll: true });
  });
  ["password", "id"].forEach((name) => {
    const panel = document.getElementById(`find-panel-${name}`);
    if (panel) panel.hidden = name !== selected;
  });
  const device = document.querySelector(".device");
  if (device) device.scrollTop = 0;
}
function bindFindAccountTabs() {
  const tabs = [...document.querySelectorAll("[data-find-tab]")];
  tabs.forEach((button, index) => {
    button.addEventListener("click", () => showFindAccountTab(button.dataset.findTab));
    button.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      showFindAccountTab(tabs[next].dataset.findTab, { focus: true });
    });
  });
}
function bindAuthUI() {
  document.getElementById("login-form")?.addEventListener("submit", login);
  document.getElementById("signup-form")?.addEventListener("submit", registerFromSignup);
  document.getElementById("password-reset-form")?.addEventListener("submit", sendPasswordReset);
  document.querySelectorAll("[data-auth-go]").forEach((button) => {
    button.addEventListener("click", () => go(button.dataset.authGo));
  });
  document.querySelectorAll("[data-auth-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.authAction;
      if (action === "google-login") void loginWithGoogle();
      else if (action === "show-account-hints") showFindHint();
      else if (action === "clear-account-hints") clearFindHints();
    });
  });
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const revealing = input.type === "password";
      input.type = revealing ? "text" : "password";
      button.setAttribute("aria-label", `${button.dataset.passwordToggle.includes("confirm") ? "비밀번호 확인" : "비밀번호"} ${revealing ? "숨기기" : "표시"}`);
      const icon = button.querySelector("i");
      if (icon) icon.className = `fa-solid ${revealing ? "fa-eye-slash" : "fa-eye"}`;
      input.focus({ preventScroll: true });
    });
  });
  document.querySelectorAll("#page-login input,#page-signup input,#page-find-account input").forEach((input) => {
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      const error = document.getElementById(`${input.id}-error`);
      if (error) {
        error.textContent = "";
        error.hidden = true;
      }
      const formError = input.closest("form")?.querySelector(".form-error");
      if (formError) {
        formError.textContent = "";
        formError.hidden = true;
      }
    });
  });
  document.querySelector("[data-sheet-dismiss]")?.addEventListener("click", () => closeSheet());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("sheet")?.classList.contains("show")) closeSheet();
  });
}

function bindAppUI() {
  const byId = (id) => document.getElementById(id);
  const on = (id, type, handler) => byId(id)?.addEventListener(type, handler);

  on("header-brand", "click", () => go("home"));
  on("header-profile", "click", () => go("settings"));
  document.querySelectorAll(".bottom-nav .nav-item").forEach((button) => {
    button.addEventListener("click", () => go(button.dataset.page));
  });
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => go(button.dataset.go));
  });
  document.querySelectorAll("[data-mypage-go]").forEach((button) => {
    button.addEventListener("click", () => go(button.dataset.mypageGo));
  });

  // Home
  on("home-write-btn", "click", () => openWriter({ reset: true }));
  on("home-fortune-card", "click", () => go("fortune"));
  on("home-question-card", "click", () => go("prompts"));
  on("home-records-all", "click", () => go("records"));

  // Records + writer
  on("writer-toggle", "click", () => {
    const open = byId("diary-editor")?.hidden;
    if (open) openWriter();
    else setEditorOpen(false);
  });
  on("writing-form", "submit", (event) => void saveManualDiary(event));
  on("records-search", "input", renderRecordsPage);
  on("records-empty-write", "click", () => openWriter({ reset: true }));
  on("ocr-gallery-file", "change", (event) => previewOcrFile(event.target.files?.[0]));
  on("ocr-camera-file", "change", (event) => previewOcrFile(event.target.files?.[0]));
  on("ocr-camera-btn", "click", openCameraOCR);
  on("ocr-run-btn", "click", () => {
    if (state.ocrFile) void runOCRFile(state.ocrFile);
  });
  const zone = byId("ocr-zone");
  if (zone) {
    ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, () => zone.classList.remove("dragging")));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      previewOcrFile(event.dataTransfer?.files?.[0]);
    });
  }
  on("record-detail-back", "click", goBackFromRecordDetail);
  on("record-delete-btn", "click", () => void deleteCurrentRecord());

  // Analysis
  on("analysis-period", "change", renderAnalysis);
  on("tracker-prev", "click", () => {
    state.trackerMonth = shiftMonth(state.trackerMonth || monthKeyOf(new Date()), -1);
    renderMoodTracker();
  });
  on("tracker-next", "click", () => {
    state.trackerMonth = shiftMonth(state.trackerMonth || monthKeyOf(new Date()), 1);
    renderMoodTracker();
  });
  on("tracker-days", "click", (event) => {
    const id = event.target.closest("[data-record-id]")?.dataset.recordId;
    const record = id && state.records.find((item) => String(item.id) === id);
    if (record) openRecordDetail(record, "records");
  });

  // Report
  document.querySelectorAll("[data-report-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.reportMode === button.dataset.reportMode) return;
      state.reportMode = button.dataset.reportMode;
      state.reportKey = "";
      renderReport();
    });
  });
  on("report-period", "change", (event) => {
    state.reportKey = event.target.value;
    renderReport();
  });

  // Prompts
  document.querySelectorAll(".prompt-slot").forEach((slot) => {
    slot.addEventListener("click", () => selectPromptSlot(slot));
    slot.addEventListener("dblclick", () => startPromptDiary(slot));
  });
  on("prompt-write-btn", "click", () => {
    const selected = document.querySelector(".prompt-slot.selected") || document.querySelector(".prompt-slot");
    if (selected) startPromptDiary(selected);
  });
  on("prompt-refresh-btn", "click", () => void refreshPrompts());

  // Fortune
  on("fortune-open-btn", "click", openTodayFortune);
  on("fortune-birthday-btn", "click", openSheet);
  on("fortune-calc-btn", "click", updateFortuneFromBirthday);
  on("fortune-write-btn", "click", () => {
    const question = String(byId("fortune-prompt-question")?.textContent || "").replace(/[“”"]/g, "").trim();
    startPromptDiary(question);
  });
  const lunar = byId("fortune-lunar-switch");
  if (lunar) {
    const toggleLunar = (event) => {
      toggleSwitch(event, lunar, "음력 입력 설정을 바꿨어요");
      lunar.setAttribute("aria-checked", String(lunar.classList.contains("on")));
    };
    lunar.addEventListener("click", toggleLunar);
    lunar.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleLunar(event);
    });
  }

  // Account pages
  on("password-submit", "click", () => void changePassword());
  on("backup-export-btn", "click", () => void exportDiaries());
}

(async function bootstrap() {
  // Legacy builds persisted a short-lived ID token here. Remove it and keep only masked account hints.
  localStorage.removeItem("handam-auth");
  state.settings = loadCachedSettings("guest");
  state.settings.theme = localStorage.getItem("handam-theme") || state.settings.theme;
  applyUserSettings(state.settings, { applyFortune: false });
  await loadAppData();
  bindSegmentButtons(); bindFindAccountTabs(); bindAuthUI(); bindSettingsPage(); bindWeekStatsSheet();
  bindHomeWeekStrip();
  initFortune();
  fillBirthdaySelects();
  bindAppUI();
  initInteractions();
  initElasticSegments();
  document.getElementById("filter-mood").addEventListener("change", renderRecordsPage);
  document.getElementById("filter-date").addEventListener("change", renderRecordsPage);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshHomeIfDateChanged();
  });
  window.addEventListener("pageshow", refreshHomeIfDateChanged);
  window.setInterval(refreshHomeIfDateChanged, 60_000);
  await initWorker();
  state.records = [];
  state.recordsSource = "none";
  renderRecordsUI();
  lastHomeDiaryDateKey = diaryEntryDate();
  try { state.admin = JSON.parse(sessionStorage.getItem("handam-admin") || "null"); } catch (_error) { state.admin = null; }
  if (state.admin?.token) {
    state.auth = { uid: "admin", isAdmin: true };
    updateUserUI();
    go("admin");
  } else {
    await new Promise((resolve) => {
      let firstEvent = true;
      onAuthStateChanged(auth, async (user) => {
        if (state.auth?.isAdmin) {
          if (firstEvent) { firstEvent = false; resolve(); }
          return;
        }
        if (user) {
          await setAuthFromUser(user);
          if (["login", "signup", "find-account"].includes(currentPageId()) || firstEvent) go("home");
        } else {
          state.auth = null;
          state.profile = null;
          state.records = [];
          state.recordsSource = "none";
          cloudLoadUid = null;
          cloudLoadPromise = null;
          renderRecordsUI();
          updateUserUI();
          go("login");
        }
        if (firstEvent) {
          firstEvent = false;
          resolve();
        }
      });
    });
  }
})();

