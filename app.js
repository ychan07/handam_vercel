import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { initInteractions, refreshInteractions } from "./interactions.js";
import { initElasticSegments, refreshElasticSegments } from "./segment-control.js";
import { animatePromptRefresh } from "./prompt-animations.js";
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
  adminUsers: [],
  adminPage: 0,
  adminExpandedUid: null,
  adminFetchedAt: null,
  settings: null,
  recordsSource: "none",
};
const ADMIN_PAGE_SIZE = 20;
const googleProvider = new GoogleAuthProvider();
const AUTH_PAGES = new Set(["login", "signup", "find-account", "admin"]);
let presenceTimer = null;
let dbWorker, workerSeq = 0;
let cloudLoadUid = null;
let cloudLoadPromise = null;
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
  document.getElementById("record-reminder-switch")?.classList.toggle("on", next.recordReminder);
  document.getElementById("fortune-lunar-switch")?.classList.toggle("on", next.lunarCalendar);
  document.querySelectorAll("[data-setting-segment]").forEach((segment) => {
    const key = segment.dataset.settingSegment;
    segment.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("on", button.dataset.value === String(next[key]));
    });
  });
  if (applyFortune) {
    state.fortuneBirthday = next.fortuneBirthday || null;
    refreshFortune();
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
    if (!quiet) showToast("설정을 서버에 저장하지 못했어요. 연결을 확인해주세요.");
    throw error;
  }
  return next;
}
async function migrateLegacyDiariesOnce(uid, migrationVersion = 0) {
  if (migrationVersion >= 1) return 1;
  const claimedBy = localStorage.getItem(LEGACY_MIGRATION_MARKER);
  const legacyRecords = claimedBy && claimedBy !== uid ? [] : await callWorker("list");
  const chunks = [];
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
async function loadCloudUserData(user) {
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
      displayName: userData.displayName || user.displayName || state.profile?.displayName || "한담",
      email: userData.email || user.email || state.profile?.email || "",
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
function adminHeaders() {
  return state.admin?.token ? { "Content-Type": "application/json", "X-Admin-Token": state.admin.token } : { "Content-Type": "application/json" };
}
async function adminApi(path, payload) {
  const data = await apiPost(path, { adminToken: state.admin?.token, ...(payload || {}) });
  return data;
}
async function sendPresenceHeartbeat() {
  if (!state.auth?.uid || state.auth.isLocalAdmin || state.auth.isAdmin) return;
  try {
    await apiPost("/api/presence", {
      uid: state.auth.uid,
      email: state.auth.email || null,
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
  const name = getDisplayName();
  const greeting = getGreeting();
  const iconClass = getGreetingIconClass();

  root.replaceChildren();

  const line = document.createElement("span");
  line.className = "home-greeting-line";
  line.textContent = `${greeting},`;
  root.append(line, document.createElement("br"));

  const nameSpan = document.createElement("span");
  nameSpan.className = "home-greeting-name";
  nameSpan.textContent = name;
  root.appendChild(nameSpan);

  const tail = document.createElement("span");
  tail.className = "home-greeting-tail";
  tail.append("님 ");

  const icon = document.createElement("i");
  icon.className = `fa-solid fa-${iconClass} home-greeting-icon`;
  icon.setAttribute("aria-hidden", "true");
  tail.appendChild(icon);
  root.appendChild(tail);
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
  const html = emotionOptions
    .map(
      (e, index) =>
        `<div class="emo-opt${index === 0 ? " sel" : ""}" data-mood="${escapeHtml(e.id)}">${e.emoji} ${escapeHtml(e.label)}</div>`
    )
    .join("");
  for (const selector of ["#manual-mood"]) {
    const container = document.querySelector(selector);
    if (!container) continue;
    container.innerHTML = html;
    delete container.dataset.moodBound;
    bindMoodPicker(selector);
  }
  refreshInteractions();
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
function formatTodayLabel() {
  const now = new Date();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${weekdays[now.getDay()]}요일`;
}
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
/** 오늘 포함 최근 7일, 표시 순서는 월→일(각 칸 요일 라벨과 날짜 일치) */
function getWeekStripDates(reference = new Date()) {
  const end = new Date(reference);
  end.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(end);
    day.setDate(end.getDate() - (6 - i));
    return day;
  });
  dates.sort((a, b) => {
    const wa = a.getDay() === 0 ? 7 : a.getDay();
    const wb = b.getDay() === 0 ? 7 : b.getDay();
    return wa - wb;
  });
  return dates;
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
function computeWritingStreak(records) {
  const dates = new Set(records.map(recordDateKey).filter(Boolean));
  if (!dates.size) return 0;
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dates.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function bindHomeWeekStrip() {
  const strip = document.getElementById("home-weekstrip");
  if (!strip || strip.dataset.bound === "1") return;
  strip.dataset.bound = "1";
  strip.addEventListener("click", (e) => {
    const day = e.target.closest(".day");
    if (!day) return;
    const dot = day.querySelector(".dot");
    if (dot?.classList.contains("dot-add")) go("diary");
  });
}
function refreshHomeIfDateChanged() {
  const todayKey = diaryEntryDate();
  if (todayKey === lastHomeDiaryDateKey) return;
  lastHomeDiaryDateKey = todayKey;
  updateUserUI();
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
    if (record) {
      dot.textContent = moodToEmoji(record.mood);
      dot.style.opacity = "1";
    } else if (isToday) {
      dot.textContent = "＋";
      dot.style.opacity = "1";
      dot.classList.add("dot-add");
      dayEl.classList.add("day-add");
      dot.title = "오늘 일기 쓰기";
    } else {
      dot.textContent = "";
      dot.style.opacity = "0.35";
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
function updateBackupStats() {
  const el = document.getElementById("backup-local-desc");
  if (!el) return;
  const count = state.records.length;
  const location = state.recordsSource === "firestore" ? "계정에 동기화됨" : "이 기기 캐시에 저장됨";
  el.textContent = `일기 ${count}편 · ${location}`;
}
function updateDiaryStatsUI() {
  updateHomeWeekDiary();
  updateBackupStats();
}
function updateUserUI() {
  const name = getDisplayName();
  const el = (id) => document.getElementById(id);
  renderHomeGreeting();
  if (el("home-date")) el("home-date").textContent = formatTodayLabel();
  if (el("settings-display-name")) el("settings-display-name").textContent = name;
  if (el("settings-email")) el("settings-email").textContent = state.auth?.email || state.profile?.email || "로그인이 필요해요";
  if (el("settings-avatar")) el("settings-avatar").textContent = name.slice(0, 1);
  if (el("diary-date-label")) el("diary-date-label").textContent = formatTodayLabel();
  updateDiaryStatsUI();
}
function openManualDiary() {
  const title = document.getElementById("manual-title");
  const body = document.getElementById("manual-body");
  if (title) title.value = "";
  if (body) body.value = "";
  state.selectedPrompt = "";
  go("manual");
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
async function setAuthFromUser(user) {
  const idToken = await user.getIdToken();
  state.auth = {
    uid: user.uid,
    email: user.email || null,
    idToken,
  };
  state.profile = loadProfile(user.uid);
  const patch = {};
  if (!state.profile?.displayName && user.displayName) patch.displayName = user.displayName;
  if (!state.profile?.email && user.email) patch.email = user.email;
  if (Object.keys(patch).length) state.profile = saveProfile(user.uid, patch);
  localStorage.setItem("handam-auth", JSON.stringify(state.auth));
  if (cloudLoadUid !== user.uid || !cloudLoadPromise) {
    cloudLoadUid = user.uid;
    cloudLoadPromise = loadCloudUserData(user);
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
    return "이메일 또는 비밀번호를 확인해주세요.";
  }
  if (code === "auth/popup-closed-by-user") return "로그인 창이 닫혔어요. 다시 시도해주세요.";
  if (code === "auth/operation-not-allowed") {
    return "해당 로그인 방식이 비활성화되어 있어요. Firebase Console에서 활성화해주세요.";
  }
  if (code === "auth/too-many-requests") return "요청이 너무 많아요. 잠시 후 다시 시도해주세요.";
  return message || "인증 처리에 실패했어요.";
}

function replayRevealAnimations(pageEl) {
  pageEl.querySelectorAll(".reveal").forEach((el) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  });
}

function go(id) {
  const target = document.getElementById("page-" + id);
  if (!target) return;
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p === target));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === id));
  document.querySelector(".device")?.classList.toggle("auth-mode", AUTH_PAGES.has(id));
  target.scrollTop = 0;
  replayRevealAnimations(target);
  if (id === "diary") resetOCR();
  if (id === "fortune") {
    if (fortuneData && state.fortuneBirthday) refreshFortune();
    renderFortuneUI();
    const fortuneAnim = getAnimations().fortune || {};
    setTimeout(animateGauge, fortuneAnim.gaugeDelayMs ?? 160);
    if (!state.fortuneBirthday) setTimeout(openSheet, fortuneAnim.sheetOpenDelayMs ?? 280);
  }
  if (id === "records") renderRecordsPage();
  if (id === "prompts") renderPromptRecommendations();
  if (id === "home" || id === "settings") {
    updateUserUI();
    renderFortuneUI();
  }
  if (id === "backup") updateBackupStats();
  if (id === "admin") loadAdminDashboard();
}
function applyTheme(t, { save = true } = {}) {
  const theme = t === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  const themeBtn = document.getElementById("theme-btn");
  if (themeBtn) themeBtn.innerHTML = theme === "dark" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  document.getElementById("dark-switch")?.classList.toggle("on", theme === "dark");
  localStorage.setItem("handam-theme", theme);
  if (save && state.settings) saveSettingsPatch({ theme }).catch(() => {});
}
function toggleTheme(event) {
  if (event) event.stopPropagation();
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
  showToast("화면 설정을 저장했어요.");
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
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}
function openSheet() {
  const scrim = document.getElementById("scrim");
  const sheet = document.getElementById("sheet");
  scrim.classList.add("show");
  sheet.classList.add("show");
  requestAnimationFrame(() => sheet.classList.add("sheet-entered"));
}
function closeSheet() {
  const scrim = document.getElementById("scrim");
  const sheet = document.getElementById("sheet");
  sheet.classList.remove("sheet-entered");
  scrim.classList.remove("show");
  sheet.classList.remove("show");
}
function animateGauge() {
  const ring = document.getElementById("gauge-ring");
  const num = document.getElementById("gauge-num");
  if (!ring || !num) return;
  const C = 515.2;
  if (window._gauge) cancelAnimationFrame(window._gauge);
  if (!state.fortune) {
    ring.style.transition = "none";
    ring.style.strokeDashoffset = C;
    num.textContent = "—";
    return;
  }
  const target = state.fortune.total;
  ring.style.transition = "none";
  ring.style.strokeDashoffset = C;
  ring.getBoundingClientRect();
  const ringDur = getAnimations().fortune?.gaugeRingTransitionS ?? 1.55;
  ring.style.transition = `stroke-dashoffset ${ringDur}s cubic-bezier(.22,1,.36,1)`;
  ring.style.strokeDashoffset = C * (1 - target / 100);
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
function bindMoodPicker(selector) {
  const container = document.querySelector(selector);
  if (!container || container.dataset.moodBound === "1") return;
  container.dataset.moodBound = "1";
  container.addEventListener("click", (e) => {
    const option = e.target.closest(".emo-opt");
    if (!option) return;
    container.querySelectorAll(".emo-opt").forEach((x) => x.classList.remove("sel"));
    option.classList.add("sel");
  });
}
function getSelectedMood(selector) {
  const selected = document.querySelector(`${selector} .emo-opt.sel`);
  if (selected?.dataset.mood) return selected.dataset.mood;
  if (selected) return parseMoodLabel(selected.textContent);
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
    showToast("인식한 글을 직접 입력란에 넣었어요. 확인한 뒤 저장하세요.");
    go("manual");
  } catch (error) {
    showToast(error.message || "OCR 처리에 실패했어요.");
    resetOCR();
  }
}

function openCameraOCR() { const input = document.getElementById("ocr-camera-file"); input.value = ""; input.click(); }
function openGalleryOCR() { const input = document.getElementById("ocr-gallery-file"); input.value = ""; input.click(); }
function resetOCR() { setOcrStep("upload"); }

async function saveManualDiary() {
  const title = document.getElementById("manual-title").value.trim() || "제목 없는 기록";
  const body = document.getElementById("manual-body").value.trim();
  if (!body) return showToast("본문을 입력해주세요.");
  const mood = formatMoodForSave(getSelectedMood("#manual-mood"));
  let summary = body;
  const settings = currentSettings();
  try {
    const ai = await apiPost("/api/llm/summarize", {
      text: body,
      persona: settings.persona,
      quality: settings.summaryQuality,
    });
    summary = ai.summary || summary;
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
        createdAt: Timestamp.fromDate(now),
        entryDate: diaryEntryDate(now),
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
        entryDate: diaryEntryDate(),
      });
      persistSerialized(result);
    }
    await reloadRecords();
    showToast("일기를 계정에 저장했어요.");
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
      matchEl.innerHTML = `<i class="fa-solid fa-bolt"></i> 일기 기록 후 분석`;
    } else {
      const moodLabel = moodKey === "default" ? "균형" : moodKey;
      matchEl.innerHTML = `<i class="fa-solid fa-bolt"></i> ${moodLabel} 감정 ${score}%`;
    }
    card.querySelector(".prompt-emoji").textContent = prompt.emoji;
    card.querySelector("h3").textContent = prompt.title;
    card.querySelector("p").textContent = prompt.desc;
  });
  const meta = document.getElementById("prompt-meta");
  if (meta) meta.innerHTML = formatPromptMeta(analysis);
  const homePrompt = document.getElementById("home-prompt-teaser");
  if (homePrompt && picks[0]) {
    const top = picks[0];
    const score = calculatePromptScore(top.prompt, top.moodKey, analysis);
    if (score == null) {
      homePrompt.textContent = "오늘의 글감을 확인해보세요.";
    } else {
      homePrompt.textContent = `${getDisplayName()}님, "${top.prompt.title}" 글감이 지금 감정에 ${score}% 맞아요.`;
    }
  }
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
  const title = card.querySelector("h3").textContent;
  state.selectedPrompt = title;
  document.getElementById("manual-title").value = title;
  document.getElementById("manual-body").value = "";
  showToast(`글감 "${title}"으로 직접 입력 화면을 열었어요.`);
  go("manual");
}

function createRecordRow(record) {
  const row = document.createElement("div");
  row.className = "diary-row tap";
  const chipClass = getEmotionChipClass(record.mood);
  row.innerHTML = `<div class="diary-thumb"><i class="fa-solid fa-pen-nib"></i></div><div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:800">${escapeHtml(record.title)}</div><div class="muted" style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${formatDate(record.createdAt)} · ${escapeHtml(record.body)}</div></div><span class="chip ${chipClass}">${escapeHtml(record.mood)}</span>`;
  row.addEventListener("click", () => {
    state.selectedRecordId = record.id;
    document.getElementById("record-title").textContent = record.title;
    document.getElementById("record-date").textContent = formatDate(record.createdAt);
    const moodEl = document.getElementById("record-mood");
    moodEl.textContent = record.mood;
    moodEl.className = `chip ${getEmotionChipClass(record.mood)}`;
    document.getElementById("record-body").textContent = record.body;
    document.getElementById("record-summary").textContent = `“${record.summary || record.body.slice(0, 60)}”`;
    go("record-detail");
  });
  return row;
}
function renderHomeRecords() {
  const box = document.getElementById("home-record-list");
  box.innerHTML = "";
  state.records.slice(0, 3).forEach((record) => box.appendChild(createRecordRow(record)));
  refreshInteractions();
}
function renderRecordsPage() {
  const box = document.getElementById("records-list");
  const moodFilter = document.getElementById("filter-mood").value;
  const dateFilter = document.getElementById("filter-date").value;
  let rows = [...state.records];
  if (moodFilter !== "all") rows = rows.filter((r) => moodMatchesFilter(r.mood, moodFilter));
  rows.sort((a, b) => (dateFilter === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
  box.innerHTML = "";
  rows.slice(0, 200).forEach((record) => box.appendChild(createRecordRow(record)));
  refreshInteractions();
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
  renderRecordsPage();
  renderPromptRecommendations();
  updateDiaryStatsUI();
}
async function deleteCurrentRecord() {
  if (!state.selectedRecordId) return;
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
    go("records");
  } catch (error) {
    console.error("일기 삭제 실패", error);
    showToast("기록을 삭제하지 못했어요.");
  }
}

async function loginAsAdmin(username, password) {
  const data = await apiPost("/api/admin/login", { username, password });
  state.admin = { token: data.token, username: data.username };
  sessionStorage.setItem("handam-admin", JSON.stringify(state.admin));
  state.auth = { uid: "admin", email: null, isAdmin: true };
  showToast("관리자 로그인 성공");
  go("admin");
}
async function login() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!email || !password) return showToast("이메일과 비밀번호를 입력해주세요.");

  // 관리자 아이디는 이메일 형식이 아닌 경우가 많음 → 관리자 API로 먼저 시도
  if (!email.includes("@")) {
    try {
      await loginAsAdmin(email, password);
    } catch (error) {
      showToast(error.message || "관리자 로그인에 실패했어요.");
    }
    return;
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await setAuthFromUser(credential.user);
    showToast("로그인 성공");
    go("home");
  } catch (error) {
    // 이메일 형식 관리자 아이디 대비: 일반 로그인 실패 시 관리자 API도 시도
    try {
      await loginAsAdmin(email, password);
      return;
    } catch (_adminError) {
      showToast(authErrorMessage(error));
    }
  }
}
async function registerFromSignup() {
  const displayName = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-password-confirm").value;
  if (!displayName) return showToast("이름을 입력해주세요.");
  if (!email) return showToast("이메일을 입력해주세요.");
  if (!password || password.length < 6) return showToast("비밀번호는 6자 이상이어야 해요.");
  if (password !== confirm) return showToast("비밀번호 확인이 일치하지 않아요.");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    saveProfile(credential.user.uid, { displayName, email });
    await setAuthFromUser(credential.user);
    showToast(`${displayName}님, 가입을 환영해요!`);
    go("home");
  } catch (error) {
    showToast(authErrorMessage(error));
  }
}
async function sendPasswordReset() {
  const email = document.getElementById("find-email").value.trim();
  if (!email) return showToast("가입 시 사용한 이메일을 입력해주세요.");
  const result = document.getElementById("find-reset-result");
  try {
    await sendPasswordResetEmail(auth, email, {
      url: getAppPublicUrl() + "/",
      handleCodeInApp: false,
    });
    if (result) {
      result.style.display = "block";
      result.innerHTML =
        "<strong>메일을 보냈어요.</strong><br>받은편지함과 <b>스팸함</b>을 모두 확인해주세요. 발신: noreply@handam-981b6.firebaseapp.com<br><br>메일이 없으면 관리자에게 문의하거나, 관리자 페이지에서 비밀번호를 직접 초기화할 수 있어요.";
    }
    showToast("재설정 메일을 보냈어요. 스팸함도 확인해주세요.");
  } catch (error) {
    if (result) result.style.display = "none";
    showToast(authErrorMessage(error));
  }
}
function showFindHint() {
  const email = document.getElementById("find-id-email").value.trim();
  const hint = document.getElementById("find-id-result");
  if (!email) return showToast("이메일 일부를 입력해주세요.");
  const stored = state.auth?.email || "";
  if (stored && stored.toLowerCase().includes(email.toLowerCase())) {
    const masked = stored.replace(/(^.).*(@.*$)/, "$1***$2");
    hint.textContent = `현재 기기에 저장된 계정: ${masked}`;
    hint.style.display = "block";
    return;
  }
  hint.textContent = "이 기기에는 해당 정보가 없어요. 가입 시 사용한 이메일 전체로 비밀번호 찾기를 이용해주세요.";
  hint.style.display = "block";
}
async function loginWithGoogle() {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const user = credential.user;
    if (user.displayName) saveProfile(user.uid, { displayName: user.displayName, email: user.email });
    await setAuthFromUser(user);
    showToast(`${getDisplayName()}님, 환영해요!`);
    go("home");
  } catch (error) {
    showToast(authErrorMessage(error));
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
  state.adminUsers = [];
  state.adminPage = 0;
  state.adminExpandedUid = null;
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
function adminLogout() {
  state.admin = null;
  state.adminUsers = [];
  state.adminPage = 0;
  state.adminExpandedUid = null;
  state.auth = null;
  state.settings = normalizeUserSettings();
  state.records = [];
  state.recordsSource = "none";
  cloudLoadUid = null;
  cloudLoadPromise = null;
  sessionStorage.removeItem("handam-admin");
  showToast("관리자 로그아웃했어요.");
  go("login");
}
function formatAdminDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.getFullYear() !== new Date().getFullYear()) {
    return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}
function adminUserLabel(user) {
  return user.displayName || user.email?.split("@")[0] || "유저";
}
function adminSortValue(user, sort) {
  const time = (v) => (v ? new Date(v).getTime() || 0 : 0);
  if (sort === "created") return time(user.createdAt);
  return time(user.lastSeen || user.lastSignIn);
}
function getFilteredAdminUsers() {
  const q = (document.getElementById("admin-search")?.value || "").trim().toLowerCase();
  const filter = document.getElementById("admin-filter")?.value || "all";
  const sort = document.getElementById("admin-sort")?.value || "recent";
  const rows = state.adminUsers.filter((user) => {
    if (filter === "active" && !user.active) return false;
    if (filter === "offline" && user.active) return false;
    if (filter === "disabled" && !user.disabled) return false;
    if (!q) return true;
    const hay = `${user.displayName || ""} ${user.email || ""} ${user.uid}`.toLowerCase();
    return hay.includes(q);
  });
  if (sort === "name") {
    rows.sort((a, b) => adminUserLabel(a).localeCompare(adminUserLabel(b), "ko"));
  } else {
    // 인원이 많아지면 활동 중인 유저가 위로 오도록 우선 정렬한다.
    rows.sort((a, b) => {
      if (sort === "recent" && a.active !== b.active) return a.active ? -1 : 1;
      return adminSortValue(b, sort) - adminSortValue(a, sort);
    });
  }
  return rows;
}
function csvCell(value) {
  const text = String(value ?? "");
  // 스프레드시트에서 수식으로 해석되지 않도록 방어한다.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
function exportAdminUsersCsv() {
  const users = getFilteredAdminUsers();
  const header = ["uid", "displayName", "email", "disabled", "active", "createdAt", "lastSignIn", "lastSeen", "providers"];
  const lines = [header.join(",")];
  users.forEach((u) => {
    lines.push(
      [
        csvCell(u.uid),
        csvCell(u.displayName || ""),
        csvCell(u.email || ""),
        u.disabled,
        u.active,
        csvCell(u.createdAt || ""),
        csvCell(u.lastSignIn || ""),
        csvCell(u.lastSeen || ""),
        csvCell((u.providers || []).join("|")),
      ].join(",")
    );
  });
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `handam-users-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("유저 목록 CSV를 저장했어요.");
}
function applyAdminStats(stats) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v ?? 0); };
  set("admin-total-users", stats.totalUsers);
  set("admin-active-users", stats.activeUsers);
  set("admin-disabled-users", stats.disabledUsers);
  set("admin-email-users", stats.emailUsers);
  set("admin-active-window", stats.activeWindowMinutes ?? 15);
  const hint = document.getElementById("admin-firebase-hint");
  if (!hint) return;
  if (!stats.firebaseConfigured) {
    hint.textContent = "FIREBASE_SERVICE_ACCOUNT 환경 변수를 설정하면 유저 관리 기능이 활성화됩니다.";
    hint.className = "admin-hint warn";
    hint.style.display = "block";
  } else if (stats.truncated) {
    hint.textContent = `유저가 ${stats.scanLimit}명을 넘어 일부만 불러왔어요. 검색으로 범위를 좁혀 주세요.`;
    hint.className = "admin-hint warn";
    hint.style.display = "block";
  } else if (stats.firestoreEnabled === false) {
    hint.textContent = "Firestore 미연동 · 활동 중 유저는 최근 로그인 기준으로 표시됩니다.";
    hint.className = "admin-hint info";
    hint.style.display = "block";
  } else {
    hint.style.display = "none";
  }
}
async function loadAdminDashboard(force = false) {
  if (!state.admin?.token) return go("login");
  const adminName = document.getElementById("admin-username-label");
  if (adminName) adminName.textContent = state.admin.username || "admin";
  const box = document.getElementById("admin-user-list");
  if (box && !state.adminUsers.length) box.innerHTML = '<div class="admin-empty">불러오는 중…</div>';
  try {
    // stats와 users를 한 번의 요청으로 받아 유저가 많아져도 Auth 스캔이 두 번 돌지 않게 한다.
    const data = await adminApi("/api/admin/overview", force ? { refresh: true } : undefined);
    applyAdminStats(data.stats || {});
    state.adminUsers = data.users || [];
    state.adminFetchedAt = data.stats?.fetchedAt || new Date().toISOString();
    paintAdminUserList();
  } catch (error) {
    if (box) box.innerHTML = `<div class="admin-empty">${escapeHtml(error.message || "목록 로드 실패")}</div>`;
    showToast(error.message || "관리자 데이터를 불러오지 못했어요.");
  }
}
async function refreshAdminUsers() {
  await loadAdminDashboard(true);
}
function changeAdminPage(delta) {
  state.adminPage += delta;
  state.adminExpandedUid = null;
  paintAdminUserList();
  document.getElementById("admin-user-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function adminUserToolsHtml(user, label) {
  const uid = escapeHtml(user.uid);
  const email = escapeHtml(user.email || "");
  return `<div class="admin-user-tools">
      ${
        user.email
          ? `<input class="input admin-reset-input" type="password" placeholder="새 비밀번호 (6자+)" data-uid="${uid}">
      <button type="button" class="admin-tool-btn" data-action="reset-pw" data-uid="${uid}"><i class="fa-solid fa-key"></i> 비번 초기화</button>
      <button type="button" class="admin-tool-btn" data-action="reset-link" data-email="${email}"><i class="fa-solid fa-link"></i> 재설정 링크</button>`
          : ""
      }
      <button type="button" class="admin-tool-btn" data-action="toggle" data-uid="${uid}" data-disabled="${user.disabled}">
        <i class="fa-solid fa-${user.disabled ? "check" : "ban"}"></i> ${user.disabled ? "정지 해제" : "계정 정지"}
      </button>
      <button type="button" class="admin-tool-btn danger" data-action="delete" data-uid="${uid}" data-label="${escapeHtml(label)}" data-email="${email}">
        <i class="fa-solid fa-trash"></i> 삭제
      </button>
      <div class="admin-user-uid">UID ${uid}</div>
    </div>`;
}
function paintAdminUserList() {
  const box = document.getElementById("admin-user-list");
  const countEl = document.getElementById("admin-list-count");
  const timeEl = document.getElementById("admin-updated-at");
  const pager = document.getElementById("admin-pager");
  if (!box) return;
  if (timeEl) timeEl.textContent = state.adminFetchedAt ? `${formatAdminDate(state.adminFetchedAt)} 기준` : "";

  const users = getFilteredAdminUsers();
  const pageCount = Math.max(1, Math.ceil(users.length / ADMIN_PAGE_SIZE));
  state.adminPage = Math.min(Math.max(state.adminPage, 0), pageCount - 1);
  const start = state.adminPage * ADMIN_PAGE_SIZE;
  const pageRows = users.slice(start, start + ADMIN_PAGE_SIZE);

  if (countEl) {
    countEl.textContent = users.length
      ? `${users.length}명 중 ${start + 1}–${start + pageRows.length}`
      : "0명";
  }
  if (pager) {
    // 한 페이지에 담기면 페이저를 숨겨 기존 화면과 같아 보이게 한다.
    pager.style.display = users.length > ADMIN_PAGE_SIZE ? "flex" : "none";
    const info = document.getElementById("admin-page-info");
    if (info) info.textContent = `${state.adminPage + 1} / ${pageCount}`;
    const prev = document.getElementById("admin-prev");
    const next = document.getElementById("admin-next");
    if (prev) prev.disabled = state.adminPage === 0;
    if (next) next.disabled = state.adminPage >= pageCount - 1;
  }
  if (!users.length) {
    box.innerHTML = '<div class="admin-empty">조건에 맞는 사용자가 없습니다.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  pageRows.forEach((user) => {
    const label = adminUserLabel(user);
    const open = state.adminExpandedUid === user.uid;
    const row = document.createElement("article");
    row.className = `admin-user-card${open ? " open" : ""}`;
    row.innerHTML = `
      <button type="button" class="admin-user-head" data-action="expand" data-uid="${escapeHtml(user.uid)}">
        <div class="admin-user-avatar${user.disabled ? " off" : ""}">${escapeHtml(label.slice(0, 1))}</div>
        <div class="admin-user-meta">
          <div class="admin-user-name">${escapeHtml(label)}</div>
          <div class="admin-user-email">${escapeHtml(user.email || "이메일 없음")}</div>
          <div class="admin-user-tags">
            <span class="chip ${user.active ? "emo-calm" : ""}">${user.active ? "활동 중" : "오프라인"}</span>
            ${user.disabled ? '<span class="chip emo-excited">정지됨</span>' : ""}
            <span class="chip">${escapeHtml((user.providers || []).map((p) => p.replace(".com", "")).join(" · ")) || "—"}</span>
          </div>
          <div class="admin-user-dates">
            가입 ${formatAdminDate(user.createdAt)} · 최근 ${formatAdminDate(user.lastSeen || user.lastSignIn)}
          </div>
        </div>
        <i class="fa-solid fa-chevron-down admin-user-caret"></i>
      </button>
      ${open ? adminUserToolsHtml(user, label) : ""}`;
    frag.appendChild(row);
  });
  box.innerHTML = "";
  box.appendChild(frag);
}
async function handleAdminUserAction(btn) {
  const action = btn.dataset.action;
  const uid = btn.dataset.uid;
  try {
    if (action === "expand") {
      state.adminExpandedUid = state.adminExpandedUid === uid ? null : uid;
      paintAdminUserList();
      return;
    }
    if (action === "reset-pw") {
      const input = document.querySelector(`.admin-reset-input[data-uid="${uid}"]`);
      const newPassword = input?.value?.trim();
      if (!newPassword || newPassword.length < 6) return showToast("6자 이상 비밀번호를 입력해주세요.");
      await adminApi("/api/admin/reset-password", { uid, newPassword });
      if (input) input.value = "";
      showToast("비밀번호를 초기화했어요.");
    } else if (action === "reset-link") {
      const data = await adminApi("/api/admin/reset-link", { email: btn.dataset.email });
      try {
        await navigator.clipboard.writeText(data.link);
        showToast("재설정 링크를 복사했어요. 카톡/메일로 전달하세요.");
      } catch (_e) {
        window.prompt("재설정 링크 (복사해서 전달하세요):", data.link);
      }
    } else if (action === "toggle") {
      const disabled = btn.dataset.disabled === "true";
      await adminApi("/api/admin/toggle-user", { uid, disabled: !disabled });
      showToast(disabled ? "계정 정지를 해제했어요." : "계정을 정지했어요.");
      await loadAdminDashboard(true);
    } else if (action === "delete") {
      // 유저가 많아지면 이름만으로는 헷갈리므로 이메일까지 함께 확인시킨다.
      const who = btn.dataset.email ? `${btn.dataset.label} (${btn.dataset.email})` : btn.dataset.label;
      if (!confirm(`"${who}" 계정을 삭제할까요? 되돌릴 수 없습니다.`)) return;
      await adminApi("/api/admin/delete-user", { uid });
      state.adminExpandedUid = null;
      showToast("계정을 삭제했어요.");
      await loadAdminDashboard(true);
    }
  } catch (error) {
    showToast(error.message || "작업에 실패했어요.");
  }
}
function bindAdminControls() {
  const repaintFromFirstPage = () => {
    state.adminPage = 0;
    state.adminExpandedUid = null;
    paintAdminUserList();
  };
  document.getElementById("admin-search")?.addEventListener("input", repaintFromFirstPage);
  document.getElementById("admin-filter")?.addEventListener("change", repaintFromFirstPage);
  document.getElementById("admin-sort")?.addEventListener("change", repaintFromFirstPage);
  // 카드마다 리스너를 붙이지 않고 위임해서, 목록이 길어져도 바인딩 비용이 늘지 않게 한다.
  document.getElementById("admin-user-list")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (btn) handleAdminUserAction(btn);
  });
}
async function saveAdminCredentials() {
  if (!state.admin?.token) return showToast("관리자 로그인이 필요해요.");
  const currentPassword = document.getElementById("admin-current-password").value;
  const newUsername = document.getElementById("admin-new-username").value.trim();
  const newPassword = document.getElementById("admin-new-password").value;
  if (!currentPassword) return showToast("현재 관리자 비밀번호를 입력해주세요.");
  try {
    const data = await apiPost("/api/admin/credentials", {
      adminToken: state.admin.token,
      currentPassword,
      newUsername: newUsername || undefined,
      newPassword: newPassword || undefined,
    });
    state.admin = { token: data.token, username: data.username };
    sessionStorage.setItem("handam-admin", JSON.stringify(state.admin));
    document.getElementById("admin-current-password").value = "";
    document.getElementById("admin-new-password").value = "";
    showToast("관리자 계정을 변경했어요. 다음부터는 새 아이디·비밀번호로 로그인하세요.");
  } catch (error) {
    showToast(error.message || "관리자 정보 변경에 실패했어요.");
  }
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
    localStorage.setItem("handam-auth", JSON.stringify(state.auth));
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
function renderFortuneUI() {
  applyFortuneLabelsFromJson();
  const hasFortune = Boolean(state.fortune);
  const f = state.fortune;
  const homePill = document.getElementById("home-fortune-pill");
  const homeQuote = document.getElementById("home-fortune-quote");
  const homeLuckyText = document.getElementById("home-fortune-lucky-text");
  const homeSwatch = document.getElementById("home-fortune-swatch");
  if (homePill) {
    homePill.innerHTML = hasFortune
      ? `<i class="fa-solid fa-star"></i> ${f.total}점`
      : `<i class="fa-solid fa-cake-candles"></i> 생일을 입력해보세요`;
  }
  if (homeQuote) {
    homeQuote.innerHTML = hasFortune
      ? `“${f.quote.replace(/<br>/g, " ")}”`
      : "생년월일을 입력하면<br>오늘의 운세 점수를 알려드려요.";
  }
  if (homeLuckyText && homeSwatch) {
    if (hasFortune) {
      homeSwatch.style.background = f.color.hex;
      homeLuckyText.textContent = `행운의 색 · ${f.color.name}`;
    } else {
      homeSwatch.style.background = "#7FB7D9";
      homeLuckyText.textContent = "운세 페이지에서 생일을 입력해 주세요";
    }
  }
  const gaugeLabel = document.getElementById("gauge-label");
  const fortuneQuote = document.getElementById("fortune-quote");
  const gaugeNum = document.getElementById("gauge-num");
  if (gaugeLabel) gaugeLabel.textContent = hasFortune ? `총운 · ${f.tier.label}` : "생일을 입력해 주세요";
  if (fortuneQuote) {
    fortuneQuote.innerHTML = hasFortune
      ? f.quote
      : "생년월일과 별자리를 바탕으로<br>오늘의 운세를 계산해 드려요.";
  }
  if (gaugeNum && !hasFortune) gaugeNum.textContent = "—";
  const zodiacEl = document.getElementById("fortune-zodiac");
  const colorEl = document.getElementById("fortune-lucky-color");
  const swatchEl = document.getElementById("fortune-lucky-swatch");
  const numbersEl = document.getElementById("fortune-lucky-numbers");
  if (zodiacEl) zodiacEl.textContent = hasFortune ? `${f.zodiac} · ${f.chinese}` : "—";
  if (colorEl) colorEl.textContent = hasFortune ? f.color.name : "—";
  if (swatchEl) swatchEl.style.background = hasFortune ? f.color.hex : "#7FB7D9";
  if (numbersEl) numbersEl.textContent = hasFortune ? `${f.numbers[0]} · ${f.numbers[1]}` : "—";
  setAdviceRow("fortune-love-score", "fortune-love-text", "fortune-love-bar", hasFortune ? f.love : null);
  setAdviceRow("fortune-money-score", "fortune-money-text", "fortune-money-bar", hasFortune ? f.money : null);
  setAdviceRow("fortune-work-score", "fortune-work-text", "fortune-work-bar", hasFortune ? f.work : null);
  const birthdayBtn = document.getElementById("fortune-birthday-btn");
  if (birthdayBtn) {
    birthdayBtn.innerHTML = hasFortune
      ? '<i class="fa-solid fa-cake-candles"></i> 생년월일 다시 입력하기'
      : '<i class="fa-solid fa-cake-candles"></i> 생년월일 입력하기';
  }
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
  renderFortuneUI();
  showToast("오늘의 운세를 계산했어요.");
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
  renderFortuneUI();
}

function bindSegmentButtons() {
  document.querySelectorAll(".seg:not(.seg-elastic)").forEach((seg) => {
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
        saveSettingsPatch({ [setting]: btn.dataset.value }).catch(() => {});
      }
      showToast(`${btn.textContent.trim()} 설정을 적용했어요`);
    });
  });
}

window.deleteCurrentRecord = deleteCurrentRecord;
window.go = go; window.toggleTheme = toggleTheme; window.toggleSwitch = toggleSwitch;
window.openCameraOCR = openCameraOCR; window.openGalleryOCR = openGalleryOCR; window.resetOCR = resetOCR;
window.refreshPrompts = refreshPrompts; window.startPromptDiary = startPromptDiary; window.openManualDiary = openManualDiary; window.saveManualDiary = saveManualDiary;
window.updateFortuneFromBirthday = updateFortuneFromBirthday; window.logout = logout; window.login = login;
window.loginWithGoogle = loginWithGoogle;
window.registerFromSignup = registerFromSignup;
window.sendPasswordReset = sendPasswordReset;
window.showFindHint = showFindHint;
window.adminLogout = adminLogout;
window.saveAdminCredentials = saveAdminCredentials;
window.refreshAdminUsers = refreshAdminUsers;
window.changeAdminPage = changeAdminPage;
window.loadAdminDashboard = loadAdminDashboard;
window.exportAdminUsersCsv = exportAdminUsersCsv;
window.changePassword = changePassword; window.exportDiaries = exportDiaries; window.showToast = showToast; window.openSheet = openSheet; window.closeSheet = closeSheet;

function bindFindAccountTabs() {
  document.querySelectorAll("[data-find-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.findTab;
      document.querySelectorAll("[data-find-tab]").forEach((b) => b.classList.toggle("on", b === btn));
      document.getElementById("find-panel-password").style.display = tab === "password" ? "block" : "none";
      document.getElementById("find-panel-id").style.display = tab === "id" ? "block" : "none";
    });
  });
}

(function preventPinchZoom() {
  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
})();

(async function bootstrap() {
  state.settings = loadCachedSettings("guest");
  state.settings.theme = localStorage.getItem("handam-theme") || state.settings.theme;
  applyUserSettings(state.settings, { applyFortune: false });
  await loadAppData();
  bindSegmentButtons(); bindFindAccountTabs(); bindAdminControls();
  bindHomeWeekStrip();
  initFortune();
  fillBirthdaySelects();
  initInteractions();
  initElasticSegments();
  document.getElementById("ocr-camera-file").addEventListener("change", (e) => runOCRFile(e.target.files?.[0]));
  document.getElementById("ocr-gallery-file").addEventListener("change", (e) => runOCRFile(e.target.files?.[0]));
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

