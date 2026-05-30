import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
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
  fortuneScore: 95,
  selectedPrompt: "",
  adminUsers: [],
};
const googleProvider = new GoogleAuthProvider();
const AUTH_PAGES = new Set(["login", "signup", "find-account", "admin"]);
let presenceTimer = null;
let dbWorker, workerSeq = 0;
const workerWaiters = new Map();
const promptRotation = { 행복: 0, 평온: 0, 설렘: 0, 차분: 0, 지침: 0, default: 0 };
const promptByMood = {
  행복: [
    { emoji: "🍜", title: "가장 행복했던 한 끼", desc: "최근 기록에서 좋은 순간이 많았어요. 기억나는 맛을 적어볼까요?", keywords: ["음식", "맛", "식사", "밥", "카페", "먹"] },
    { emoji: "🎉", title: "웃음이 터졌던 장면", desc: "오늘 가장 크게 웃었던 순간을 구체적으로 남겨보세요.", keywords: ["웃", "친구", "즐거", "행복", "축하"] },
    { emoji: "🌞", title: "기분 좋은 습관", desc: "행복을 키워준 작은 습관 하나를 써볼까요?", keywords: ["습관", "루틴", "아침", "운동", "산책"] },
  ],
  평온: [
    { emoji: "🌙", title: "요즘 나를 쉬게 하는 것", desc: "평온했던 루틴 하나를 떠올려 보세요.", keywords: ["휴식", "잠", "차", "조용", "편안"] },
    { emoji: "☕", title: "조용했던 순간", desc: "오늘 가장 조용하고 편안했던 장면을 기록해보세요.", keywords: ["조용", "혼자", "카페", "창가", "바람"] },
    { emoji: "🍃", title: "천천히 숨 쉬던 때", desc: "마음이 안정됐던 순간을 문장으로 남겨보세요.", keywords: ["호흡", "명상", "산책", "하늘", "평온"] },
  ],
  설렘: [
    { emoji: "✨", title: "기대되는 내일", desc: "요즘 가장 기다려지는 일은 무엇인가요?", keywords: ["기대", "내일", "계획", "여행", "만남"] },
    { emoji: "🚀", title: "새로 시작한 도전", desc: "새롭게 시작한 일의 첫 감정을 기록해보세요.", keywords: ["시작", "도전", "프로젝트", "공부", "새로"] },
    { emoji: "💡", title: "아이디어가 번뜩인 순간", desc: "떠오른 아이디어를 놓치지 말고 남겨보세요.", keywords: ["아이디어", "영감", "떠오", "계획", "꿈"] },
  ],
  차분: [
    { emoji: "📷", title: "사진처럼 남은 순간", desc: "오늘을 한 장면으로 고른다면 무엇인가요?", keywords: ["사진", "풍경", "하늘", "거리", "기억"] },
    { emoji: "🪴", title: "작게 나아진 부분", desc: "어제보다 나아진 점 하나만 써도 충분해요.", keywords: ["성장", "배움", "조금", "나아", "변화"] },
    { emoji: "✍️", title: "생각 정리 노트", desc: "머릿속을 정리하듯 중요한 생각을 써보세요.", keywords: ["생각", "정리", "고민", "결정", "메모"] },
  ],
  지침: [
    { emoji: "🛌", title: "오늘 나를 버티게 한 것", desc: "힘들었지만 버틸 수 있었던 이유를 적어보세요.", keywords: ["힘", "버티", "지침", "피곤", "위로"] },
    { emoji: "🤍", title: "나를 위로하는 한마디", desc: "오늘의 나에게 들려주고 싶은 말을 남겨보세요.", keywords: ["위로", "나에게", "괜찮", "쉬", "마음"] },
    { emoji: "🌧️", title: "무거운 마음 정리", desc: "지친 마음을 그대로 적어도 괜찮아요.", keywords: ["무거", "슬픔", "걱정", "스트레스", "힘들"] },
  ],
  default: [
    { emoji: "💌", title: "1년 뒤의 나에게", desc: "미래의 나에게 전하고 싶은 마음을 적어보세요.", keywords: ["미래", "목표", "꿈", "약속", "편지"] },
    { emoji: "🧭", title: "다음 주의 작은 약속", desc: "가볍게 실천할 수 있는 약속 하나를 정해보세요.", keywords: ["약속", "계획", "실천", "다음", "주"] },
    { emoji: "🌱", title: "나를 성장시킨 경험", desc: "최근 배운 점을 짧게 정리해보세요.", keywords: ["배움", "경험", "성장", "교훈", "깨달"] },
  ],
};

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
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "좋은 아침이에요";
  if (hour < 18) return "좋은 오후예요";
  return "좋은 저녁이에요";
}
function formatTodayLabel() {
  const now = new Date();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${weekdays[now.getDay()]}요일`;
}
function updateUserUI() {
  const name = getDisplayName();
  const greeting = getGreeting();
  const el = (id) => document.getElementById(id);
  if (el("home-greeting")) el("home-greeting").innerHTML = `${greeting},<br>${name}님 ☀️`;
  if (el("home-date")) el("home-date").textContent = formatTodayLabel();
  if (el("settings-display-name")) el("settings-display-name").textContent = name;
  if (el("settings-email")) el("settings-email").textContent = state.auth?.email || state.profile?.email || "로그인이 필요해요";
  if (el("settings-avatar")) el("settings-avatar").textContent = name.slice(0, 1);
  if (el("diary-date-label")) el("diary-date-label").textContent = formatTodayLabel();
}
function buildDiaryCorpus(records) {
  return records.map((r) => `${r.title} ${r.body} ${r.summary || ""} ${r.mood}`).join(" ").toLowerCase();
}
function calculatePromptScore(prompt, moodKey, context) {
  const { topMood, recentRecords, corpus } = context;
  let score = 52;
  if (moodKey === topMood) score += 26;
  else if (moodKey === "default") score += 10;
  const keywords = prompt.keywords || [];
  let hits = 0;
  for (const kw of keywords) { if (corpus.includes(kw.toLowerCase())) hits += 1; }
  score += Math.min(24, hits * 7);
  score += Math.min(8, recentRecords.length);
  const recentTitles = recentRecords.map((r) => r.title);
  if (!recentTitles.some((t) => t.includes(prompt.title.slice(0, 3)))) score += 6;
  const moodCount = recentRecords.filter((r) => r.mood === topMood).length;
  if (moodCount >= 3 && moodKey === topMood) score += 5;
  return Math.max(68, Math.min(99, Math.round(score)));
}

function callWorker(type, payload = {}) { return new Promise((resolve, reject) => { const id = ++workerSeq; workerWaiters.set(id, { resolve, reject }); dbWorker.postMessage({ id, type, payload }); }); }
function persistSerialized(result) { if (result?.serialized) localStorage.setItem("handam-sqlite", JSON.stringify(result.serialized)); }
function initWorker() { dbWorker = new Worker("./db-worker.js"); dbWorker.onmessage = (event) => { const { id, data, error } = event.data || {}; const waiter = workerWaiters.get(id); if (!waiter) return; workerWaiters.delete(id); if (error) waiter.reject(new Error(error)); else waiter.resolve(data); }; const serialized = localStorage.getItem("handam-sqlite"); return callWorker("init", { serialized: serialized ? JSON.parse(serialized) : null }).then((data) => { persistSerialized(data); return data; }); }
function formatDate(isoDate) { const date = new Date(isoDate); return `${date.getMonth() + 1}월 ${date.getDate()}일`; }
function apiPost(url, payload) { return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "요청이 실패했습니다."); return data; }); }
function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "").split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); }); }
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
  updateUserUI();
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

function go(id) {
  const target = document.getElementById("page-" + id);
  if (!target) return;
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p === target));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === id));
  document.querySelector(".device")?.classList.toggle("auth-mode", AUTH_PAGES.has(id));
  target.scrollTop = 0;
  if (id === "diary") resetOCR();
  if (id === "fortune") setTimeout(animateGauge, 160);
  if (id === "records") renderRecordsPage();
  if (id === "prompts") renderPromptRecommendations();
  if (id === "home" || id === "settings") updateUserUI();
  if (id === "admin") loadAdminDashboard();
}
function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); document.getElementById("theme-btn").innerHTML = t === "dark" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>'; const darkSwitch = document.getElementById("dark-switch"); if (darkSwitch) darkSwitch.classList.toggle("on", t === "dark"); localStorage.setItem("handam-theme", t); }
function toggleTheme(event) { if (event) event.stopPropagation(); const cur = document.documentElement.getAttribute("data-theme"); applyTheme(cur === "dark" ? "light" : "dark"); }
function toggleSwitch(event, element, message) { if (event) event.stopPropagation(); element.classList.toggle("on"); if (message) showToast(message); }
function showToast(message) { const toast = document.getElementById("toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(window._toastTimer); window._toastTimer = setTimeout(() => toast.classList.remove("show"), 1900); }
function openSheet() { document.getElementById("scrim").classList.add("show"); document.getElementById("sheet").classList.add("show"); }
function closeSheet() { document.getElementById("scrim").classList.remove("show"); document.getElementById("sheet").classList.remove("show"); }
function animateGauge() { const ring = document.getElementById("gauge-ring"), num = document.getElementById("gauge-num"), C = 515.2, target = state.fortuneScore || 95; ring.style.transition = "none"; ring.style.strokeDashoffset = C; ring.getBoundingClientRect(); ring.style.transition = "stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1)"; ring.style.strokeDashoffset = C * (1 - target / 100); let v = 0; clearInterval(window._gauge); window._gauge = setInterval(() => { v += 2; if (v >= target) { v = target; clearInterval(window._gauge); } num.textContent = String(v); }, 24); }
function setStep(step) { document.getElementById("ocr-upload").style.display = step === "upload" ? "block" : "none"; document.getElementById("ocr-loading").style.display = step === "loading" ? "block" : "none"; document.getElementById("ocr-result").style.display = step === "result" ? "block" : "none"; }
function bindMoodPicker(selector) { const container = document.querySelector(selector); if (!container) return; container.addEventListener("click", (e) => { const option = e.target.closest(".emo-opt"); if (!option) return; container.querySelectorAll(".emo-opt").forEach((x) => x.classList.remove("sel")); option.classList.add("sel"); }); }
function getSelectedMood(selector) { const selected = document.querySelector(`${selector} .emo-opt.sel`); return selected ? selected.textContent.replace(/^[^\s]+\s*/, "").trim() : "평온"; }

async function runOCRFile(file) {
  if (!file) return;
  setStep("loading");
  const status = document.getElementById("ocr-status");
  status.textContent = "손글씨를 인식하고 있어요…";
  try {
    const base64 = await fileToBase64(file);
    const ocrData = await apiPost("/api/ocr", { imageBase64: base64 });
    status.textContent = "AI가 문장을 다듬고 있어요…";
    const ai = await apiPost("/api/llm/summarize", { text: ocrData.text || "텍스트 인식 실패" });
    document.getElementById("ocr-origin").textContent = ai.cleanedText || ocrData.text || "";
    document.getElementById("ocr-summary").textContent = `“${ai.summary || "요약을 생성하지 못했습니다."}”`;
    setStep("result");
  } catch (error) { showToast(error.message || "OCR 처리에 실패했어요."); resetOCR(); }
}

function openCameraOCR() { const input = document.getElementById("ocr-camera-file"); input.value = ""; input.click(); }
function openGalleryOCR() { const input = document.getElementById("ocr-gallery-file"); input.value = ""; input.click(); }
function resetOCR() { setStep("upload"); document.getElementById("ocr-origin").textContent = ""; document.getElementById("ocr-summary").textContent = ""; }

async function saveDiary() {
  const title = state.selectedPrompt || "OCR 기록";
  const body = document.getElementById("ocr-origin").textContent.trim();
  const summary = document.getElementById("ocr-summary").textContent.replace(/^“|”$/g, "");
  if (!body) return showToast("저장할 OCR 결과가 없어요.");
  const result = await callWorker("insert", { title, body, summary, mood: getSelectedMood("#emo-pick"), createdAt: new Date().toISOString() });
  persistSerialized(result); await reloadRecords(); showToast("OCR 일기를 저장했어요."); go("records");
}

async function saveManualDiary() {
  const title = document.getElementById("manual-title").value.trim() || "제목 없는 기록";
  const body = document.getElementById("manual-body").value.trim();
  if (!body) return showToast("본문을 입력해주세요.");
  const mood = getSelectedMood("#manual-mood");
  let summary = body;
  try { const ai = await apiPost("/api/llm/summarize", { text: body }); summary = ai.summary || summary; } catch (_error) {}
  const result = await callWorker("insert", { title, body, mood, summary, createdAt: new Date().toISOString() });
  persistSerialized(result); await reloadRecords(); showToast("직접 입력 일기를 저장했어요."); go("records");
}

function dominantMoodFromRecent() {
  const recent = state.records.slice(0, 14);
  const counts = {};
  for (const record of recent) counts[record.mood] = (counts[record.mood] || 0) + 1;
  let topMood = "default", top = -1;
  Object.entries(counts).forEach(([mood, count]) => { if (count > top) { top = count; topMood = mood; } });
  return { topMood, recentCount: recent.length };
}

function renderPromptRecommendations() {
  const { topMood, recentCount } = dominantMoodFromRecent();
  const key = promptByMood[topMood] ? topMood : "default";
  const pool = promptByMood[key];
  const offset = promptRotation[key] % pool.length;
  const picks = [pool[offset % pool.length], pool[(offset + 1) % pool.length], pool[(offset + 2) % pool.length]];
  const recentRecords = state.records.slice(0, 14);
  const context = { topMood: key, recentRecords, corpus: buildDiaryCorpus(recentRecords) };
  const cards = document.querySelectorAll(".prompt-slot");
  cards.forEach((card, index) => {
    const prompt = picks[index];
    const score = calculatePromptScore(prompt, key, context);
    card.dataset.score = String(score);
    card.querySelector(".match").innerHTML = `<i class="fa-solid fa-bolt"></i> 추천도 ${score}%`;
    card.querySelector(".prompt-emoji").textContent = prompt.emoji;
    card.querySelector("h3").textContent = prompt.title;
    card.querySelector("p").textContent = prompt.desc;
  });
  const meta = document.getElementById("prompt-meta");
  const topScore = Math.max(...[...cards].map((c) => Number(c.dataset.score || 0)));
  meta.innerHTML = `최근 일기 <b style="color:var(--text)">${recentCount}편</b>을 분석해<br>감정 "${key === "default" ? "균형" : key}" 기준 · 최고 추천도 <b style="color:var(--text)">${topScore}%</b>`;
  const homePrompt = document.getElementById("home-prompt-teaser");
  if (homePrompt && picks[0]) {
    homePrompt.textContent = `${getDisplayName()}님, "${picks[0].title}" 글감이 오늘 가장 잘 맞아요.`;
  }
}

function refreshPrompts() { const { topMood } = dominantMoodFromRecent(); const key = promptByMood[topMood] ? topMood : "default"; promptRotation[key] += 1; renderPromptRecommendations(); showToast("새 글감을 골랐어요"); }
function startPromptDiary(card) { const title = card.querySelector("h3").textContent; state.selectedPrompt = title; document.getElementById("manual-title").value = title; document.getElementById("manual-body").value = ""; showToast(`글감 "${title}"으로 직접 입력 화면을 열었어요.`); go("manual"); }

function createRecordRow(record) {
  const row = document.createElement("div");
  row.className = "diary-row tap";
  row.innerHTML = `<div class="diary-thumb"><i class="fa-solid fa-pen-nib"></i></div><div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:800">${record.title}</div><div class="muted" style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${formatDate(record.createdAt)} · ${record.body}</div></div><span class="chip">${record.mood}</span>`;
  row.addEventListener("click", () => { state.selectedRecordId = record.id; document.getElementById("record-title").textContent = record.title; document.getElementById("record-date").textContent = formatDate(record.createdAt); document.getElementById("record-mood").textContent = record.mood; document.getElementById("record-body").textContent = record.body; document.getElementById("record-summary").textContent = `“${record.summary || record.body.slice(0, 60)}”`; go("record-detail"); });
  return row;
}
function renderHomeRecords() { const box = document.getElementById("home-record-list"); box.innerHTML = ""; state.records.slice(0, 3).forEach((record) => box.appendChild(createRecordRow(record))); }
function renderRecordsPage() { const box = document.getElementById("records-list"); const moodFilter = document.getElementById("filter-mood").value; const dateFilter = document.getElementById("filter-date").value; let rows = [...state.records]; if (moodFilter !== "all") rows = rows.filter((r) => r.mood === moodFilter); rows.sort((a, b) => dateFilter === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)); box.innerHTML = ""; rows.slice(0, 200).forEach((record) => box.appendChild(createRecordRow(record))); }
async function reloadRecords() { state.records = await callWorker("list"); renderHomeRecords(); renderRecordsPage(); renderPromptRecommendations(); }
async function deleteCurrentRecord() { if (!state.selectedRecordId) return; const result = await callWorker("delete", { id: state.selectedRecordId }); persistSerialized(result); state.selectedRecordId = null; await reloadRecords(); showToast("기록을 삭제했어요."); go("records"); }

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

  if (email === "admin" && password === "admin") {
    try {
      await loginAsAdmin("admin", "admin");
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
    showToast(authErrorMessage(error));
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
  localStorage.removeItem("handam-auth");
  sessionStorage.removeItem("handam-admin");
  stopPresenceHeartbeat();
  updateUserUI();
  showToast("로그아웃했어요.");
  go("login");
}
function adminLogout() {
  state.admin = null;
  state.auth = null;
  sessionStorage.removeItem("handam-admin");
  showToast("관리자 로그아웃했어요.");
  go("login");
}
function formatAdminDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function getFilteredAdminUsers() {
  const q = (document.getElementById("admin-search")?.value || "").trim().toLowerCase();
  const filter = document.getElementById("admin-filter")?.value || "all";
  return state.adminUsers.filter((user) => {
    if (filter === "active" && !user.active) return false;
    if (filter === "disabled" && !user.disabled) return false;
    if (filter === "online" && !user.active) return false;
    if (!q) return true;
    const hay = `${user.displayName || ""} ${user.email || ""} ${user.uid}`.toLowerCase();
    return hay.includes(q);
  });
}
function exportAdminUsersCsv() {
  const users = getFilteredAdminUsers();
  const header = ["uid", "displayName", "email", "disabled", "active", "createdAt", "lastSignIn", "providers"];
  const lines = [header.join(",")];
  users.forEach((u) => {
    lines.push(
      [
        u.uid,
        `"${(u.displayName || "").replace(/"/g, '""')}"`,
        u.email || "",
        u.disabled,
        u.active,
        u.createdAt || "",
        u.lastSignIn || "",
        `"${(u.providers || []).join("|")}"`,
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
async function loadAdminDashboard() {
  if (!state.admin?.token) return go("login");
  const adminName = document.getElementById("admin-username-label");
  if (adminName) adminName.textContent = state.admin.username || "admin";
  try {
    const stats = await adminApi("/api/admin/stats");
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v ?? 0); };
    set("admin-total-users", stats.totalUsers);
    set("admin-active-users", stats.activeUsers);
    set("admin-disabled-users", stats.disabledUsers);
    set("admin-email-users", stats.emailUsers);
    set("admin-active-window", stats.activeWindowMinutes ?? 15);
    const hint = document.getElementById("admin-firebase-hint");
    if (hint) {
      if (!stats.firebaseConfigured) {
        hint.textContent = "FIREBASE_SERVICE_ACCOUNT 환경 변수를 설정하면 유저 관리 기능이 활성화됩니다.";
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
    await renderAdminUsers();
  } catch (error) {
    showToast(error.message || "관리자 데이터를 불러오지 못했어요.");
  }
}
async function renderAdminUsers() {
  const box = document.getElementById("admin-user-list");
  const countEl = document.getElementById("admin-list-count");
  if (!box) return;
  box.innerHTML = '<div class="admin-empty">불러오는 중…</div>';
  try {
    const data = await adminApi("/api/admin/users");
    state.adminUsers = data.users || [];
    paintAdminUserList();
    if (countEl) countEl.textContent = `${getFilteredAdminUsers().length}명 표시`;
  } catch (error) {
    box.innerHTML = `<div class="admin-empty">${error.message || "목록 로드 실패"}</div>`;
  }
}
function paintAdminUserList() {
  const box = document.getElementById("admin-user-list");
  const countEl = document.getElementById("admin-list-count");
  if (!box) return;
  const users = getFilteredAdminUsers();
  if (countEl) countEl.textContent = `${users.length}명 표시`;
  if (!users.length) {
    box.innerHTML = '<div class="admin-empty">조건에 맞는 사용자가 없습니다.</div>';
    return;
  }
  box.innerHTML = "";
  users.forEach((user) => {
    const label = user.displayName || user.email?.split("@")[0] || "유저";
    const initial = label.slice(0, 1);
    const row = document.createElement("article");
    row.className = "admin-user-card";
    row.innerHTML = `
      <div class="admin-user-head">
        <div class="admin-user-avatar">${initial}</div>
        <div class="admin-user-meta">
          <div class="admin-user-name">${label}</div>
          <div class="admin-user-email">${user.email || "이메일 없음"}</div>
          <div class="admin-user-tags">
            <span class="chip ${user.active ? "emo-calm" : ""}">${user.active ? "활동 중" : "오프라인"}</span>
            ${user.disabled ? '<span class="chip emo-excited">정지됨</span>' : ""}
            <span class="chip">${(user.providers || []).map((p) => p.replace(".com", "")).join(" · ") || "—"}</span>
          </div>
          <div class="admin-user-dates">
            가입 ${formatAdminDate(user.createdAt)} · 최근 ${formatAdminDate(user.lastSignIn)}
          </div>
        </div>
      </div>
      <div class="admin-user-tools">
        ${
          user.email
            ? `<input class="input admin-reset-input" type="password" placeholder="새 비밀번호 (6자+)" data-uid="${user.uid}">
        <button type="button" class="admin-tool-btn" data-action="reset-pw" data-uid="${user.uid}"><i class="fa-solid fa-key"></i> 비번 초기화</button>
        <button type="button" class="admin-tool-btn" data-action="reset-link" data-email="${user.email}"><i class="fa-solid fa-link"></i> 재설정 링크</button>`
            : ""
        }
        <button type="button" class="admin-tool-btn" data-action="toggle" data-uid="${user.uid}" data-disabled="${user.disabled}">
          <i class="fa-solid fa-${user.disabled ? "check" : "ban"}"></i> ${user.disabled ? "정지 해제" : "계정 정지"}
        </button>
        <button type="button" class="admin-tool-btn danger" data-action="delete" data-uid="${user.uid}" data-label="${label}">
          <i class="fa-solid fa-trash"></i> 삭제
        </button>
      </div>`;
    box.appendChild(row);
  });
  box.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleAdminUserAction(btn));
  });
}
async function handleAdminUserAction(btn) {
  const action = btn.dataset.action;
  const uid = btn.dataset.uid;
  try {
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
      await renderAdminUsers();
    } else if (action === "delete") {
      if (!confirm(`"${btn.dataset.label}" 계정을 삭제할까요? 되돌릴 수 없습니다.`)) return;
      await adminApi("/api/admin/delete-user", { uid });
      showToast("계정을 삭제했어요.");
      await loadAdminDashboard();
    }
  } catch (error) {
    showToast(error.message || "작업에 실패했어요.");
  }
}
function bindAdminControls() {
  document.getElementById("admin-search")?.addEventListener("input", paintAdminUserList);
  document.getElementById("admin-filter")?.addEventListener("change", paintAdminUserList);
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
    showToast("관리자 계정 정보를 변경했어요.");
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

function fillBirthdaySelects() {
  const y = document.getElementById("fortune-year"), m = document.getElementById("fortune-month"), d = document.getElementById("fortune-day");
  const now = new Date(); const currentYear = now.getFullYear();
  for (let year = currentYear; year >= 1950; year -= 1) { const opt = document.createElement("option"); opt.value = String(year); opt.textContent = String(year); if (year === 1996) opt.selected = true; y.appendChild(opt); }
  for (let month = 1; month <= 12; month += 1) { const opt = document.createElement("option"); opt.value = String(month).padStart(2, "0"); opt.textContent = `${month}월`; if (month === 5) opt.selected = true; m.appendChild(opt); }
  for (let day = 1; day <= 31; day += 1) { const opt = document.createElement("option"); opt.value = String(day).padStart(2, "0"); opt.textContent = `${day}일`; if (day === 20) opt.selected = true; d.appendChild(opt); }
}
async function updateFortuneFromBirthday() {
  const birthday = `${document.getElementById("fortune-year").value}-${document.getElementById("fortune-month").value}-${document.getElementById("fortune-day").value}`;
  try { const data = await apiPost("/api/fortune", { birthday }); const score = Number(data.score || data.total || data.data?.score || 95); state.fortuneScore = Number.isFinite(score) ? Math.max(1, Math.min(100, score)) : 95; closeSheet(); showToast("실제 운세 API 결과로 갱신했어요."); setTimeout(animateGauge, 100); }
  catch (error) { showToast(error.message || "운세 조회에 실패했어요."); }
}

function bindSegmentButtons() { document.querySelectorAll(".seg").forEach((seg) => seg.addEventListener("click", (e) => { const btn = e.target.closest("button"); if (!btn) return; seg.querySelectorAll("button").forEach((x) => x.classList.remove("on")); btn.classList.add("on"); showToast(btn.textContent.trim() + " 설정을 적용했어요"); })); }

window.deleteCurrentRecord = deleteCurrentRecord;
window.go = go; window.toggleTheme = toggleTheme; window.toggleSwitch = toggleSwitch;
window.openCameraOCR = openCameraOCR; window.openGalleryOCR = openGalleryOCR; window.resetOCR = resetOCR; window.saveDiary = saveDiary;
window.refreshPrompts = refreshPrompts; window.startPromptDiary = startPromptDiary; window.saveManualDiary = saveManualDiary;
window.updateFortuneFromBirthday = updateFortuneFromBirthday; window.logout = logout; window.login = login;
window.loginWithGoogle = loginWithGoogle;
window.registerFromSignup = registerFromSignup;
window.sendPasswordReset = sendPasswordReset;
window.showFindHint = showFindHint;
window.adminLogout = adminLogout;
window.saveAdminCredentials = saveAdminCredentials;
window.renderAdminUsers = renderAdminUsers;
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
  applyTheme(localStorage.getItem("handam-theme") || "light");
  bindMoodPicker("#emo-pick"); bindMoodPicker("#manual-mood"); bindSegmentButtons(); bindFindAccountTabs(); bindAdminControls();
  fillBirthdaySelects();
  document.getElementById("ocr-camera-file").addEventListener("change", (e) => runOCRFile(e.target.files?.[0]));
  document.getElementById("ocr-gallery-file").addEventListener("change", (e) => runOCRFile(e.target.files?.[0]));
  document.getElementById("filter-mood").addEventListener("change", renderRecordsPage);
  document.getElementById("filter-date").addEventListener("change", renderRecordsPage);
  await initWorker(); await reloadRecords();
  onAuthStateChanged(auth, async (user) => {
    if (!user || state.auth?.isAdmin) return;
    await setAuthFromUser(user);
    if (["login", "signup", "find-account"].includes(currentPageId())) go("home");
  });
  try { state.admin = JSON.parse(sessionStorage.getItem("handam-admin") || "null"); } catch (_error) { state.admin = null; }
  try { state.auth = JSON.parse(localStorage.getItem("handam-auth") || "null"); } catch (_error) { state.auth = null; }
  if (state.auth?.uid && !state.auth.isAdmin) state.profile = loadProfile(state.auth.uid);
  updateUserUI();
  if (state.admin?.token) {
    state.auth = { uid: "admin", isAdmin: true };
    go("admin");
  } else if (state.auth && !state.auth.isAdmin) {
    startPresenceHeartbeat();
    go("home");
  } else {
    go("login");
  }
})();

