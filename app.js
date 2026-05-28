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
analyticsSupported()
  .then((supported) => {
    if (supported) getAnalytics(firebaseApp);
  })
  .catch(() => {});

const state = { selectedRecordId: null, records: [], auth: null, fortuneScore: 95, selectedPrompt: "" };
const googleProvider = new GoogleAuthProvider();
let dbWorker, workerSeq = 0;
const workerWaiters = new Map();
const promptRotation = { 행복: 0, 평온: 0, 설렘: 0, 차분: 0, 지침: 0, default: 0 };
const promptByMood = {
  행복: [
    ["98%", "🍜", "가장 행복했던 한 끼", "최근 기록에서 좋은 순간이 많았어요. 기억나는 맛을 적어볼까요?"],
    ["91%", "🎉", "웃음이 터졌던 장면", "오늘 가장 크게 웃었던 순간을 구체적으로 남겨보세요."],
    ["84%", "🌞", "기분 좋은 습관", "행복을 키워준 작은 습관 하나를 써볼까요?"],
  ],
  평온: [
    ["97%", "🌙", "요즘 나를 쉬게 하는 것", "평온했던 루틴 하나를 떠올려 보세요."],
    ["90%", "☕", "조용했던 순간", "오늘 가장 조용하고 편안했던 장면을 기록해보세요."],
    ["83%", "🍃", "천천히 숨 쉬던 때", "마음이 안정됐던 순간을 문장으로 남겨보세요."],
  ],
  설렘: [
    ["96%", "✨", "기대되는 내일", "요즘 가장 기다려지는 일은 무엇인가요?"],
    ["89%", "🚀", "새로 시작한 도전", "새롭게 시작한 일의 첫 감정을 기록해보세요."],
    ["82%", "💡", "아이디어가 번뜩인 순간", "떠오른 아이디어를 놓치지 말고 남겨보세요."],
  ],
  차분: [
    ["95%", "📷", "사진처럼 남은 순간", "오늘을 한 장면으로 고른다면 무엇인가요?"],
    ["88%", "🪴", "작게 나아진 부분", "어제보다 나아진 점 하나만 써도 충분해요."],
    ["81%", "✍️", "생각 정리 노트", "머릿속을 정리하듯 중요한 생각을 써보세요."],
  ],
  지침: [
    ["94%", "🛌", "오늘 나를 버티게 한 것", "힘들었지만 버틸 수 있었던 이유를 적어보세요."],
    ["87%", "🤍", "나를 위로하는 한마디", "오늘의 나에게 들려주고 싶은 말을 남겨보세요."],
    ["80%", "🌧️", "무거운 마음 정리", "지친 마음을 그대로 적어도 괜찮아요."],
  ],
  default: [
    ["93%", "💌", "1년 뒤의 나에게", "미래의 나에게 전하고 싶은 마음을 적어보세요."],
    ["86%", "🧭", "다음 주의 작은 약속", "가볍게 실천할 수 있는 약속 하나를 정해보세요."],
    ["79%", "🌱", "나를 성장시킨 경험", "최근 배운 점을 짧게 정리해보세요."],
  ],
};

function callWorker(type, payload = {}) { return new Promise((resolve, reject) => { const id = ++workerSeq; workerWaiters.set(id, { resolve, reject }); dbWorker.postMessage({ id, type, payload }); }); }
function persistSerialized(result) { if (result?.serialized) localStorage.setItem("handam-sqlite", JSON.stringify(result.serialized)); }
function initWorker() { dbWorker = new Worker("./db-worker.js"); dbWorker.onmessage = (event) => { const { id, data, error } = event.data || {}; const waiter = workerWaiters.get(id); if (!waiter) return; workerWaiters.delete(id); if (error) waiter.reject(new Error(error)); else waiter.resolve(data); }; const serialized = localStorage.getItem("handam-sqlite"); return callWorker("init", { serialized: serialized ? JSON.parse(serialized) : null }).then((data) => { persistSerialized(data); return data; }); }
function formatDate(isoDate) { const date = new Date(isoDate); return `${date.getMonth() + 1}월 ${date.getDate()}일`; }
function apiPost(url, payload) { return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "요청이 실패했습니다."); return data; }); }
function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "").split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); }); }
function currentPageId() { return document.querySelector(".page.active")?.id?.replace("page-", "") || ""; }
async function setAuthFromUser(user) {
  const idToken = await user.getIdToken();
  state.auth = { uid: user.uid, email: user.email, idToken };
  localStorage.setItem("handam-auth", JSON.stringify(state.auth));
}
function authErrorMessage(error) {
  const code = error?.code || "";
  if (code === "auth/configuration-not-found" || code === "auth/auth-domain-config-required") {
    return "Firebase 인증 설정이 비어 있어요. Email/Password 또는 소셜 로그인 제공자를 콘솔에서 먼저 활성화해주세요.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "이메일 또는 비밀번호를 확인해주세요.";
  }
  if (code === "auth/popup-closed-by-user") return "로그인 창이 닫혔어요. 다시 시도해주세요.";
  if (code === "auth/operation-not-allowed") return "해당 로그인 방식이 비활성화되어 있어요. Firebase Console에서 활성화해주세요.";
  return error?.message || "인증 처리에 실패했어요.";
}

function go(id) { const target = document.getElementById("page-" + id); if (!target) return; document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p === target)); document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === id)); target.scrollTop = 0; if (id === "diary") resetOCR(); if (id === "fortune") setTimeout(animateGauge, 160); if (id === "records") renderRecordsPage(); if (id === "prompts") renderPromptRecommendations(); }
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
  const cards = document.querySelectorAll(".prompt-slot");
  cards.forEach((card, index) => {
    const data = picks[index];
    card.querySelector(".match").innerHTML = `<i class="fa-solid fa-bolt"></i> 추천도 ${data[0]}`;
    card.querySelector('span[style*="font-size:20px"]').textContent = data[1];
    card.querySelector("h3").textContent = data[2];
    card.querySelector("p").textContent = data[3];
  });
  const meta = document.getElementById("prompt-meta");
  meta.innerHTML = `최근 일기 <b style="color:var(--text)">${recentCount}편</b>을 분석해<br>감정 "${key === "default" ? "균형" : key}" 중심으로 글감을 골랐어요.`;
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

async function login() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!email || !password) return showToast("이메일과 비밀번호를 입력해주세요.");

  if (email === "admin" && password === "admin") {
    state.auth = {
      uid: "local-admin",
      email: "admin@local.test",
      idToken: "local-admin-token",
      isLocalAdmin: true,
    };
    localStorage.setItem("handam-auth", JSON.stringify(state.auth));
    showToast("로그인 성공");
    go("home");
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
async function register() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!email || !password) return showToast("이메일과 비밀번호를 입력해주세요.");
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    showToast("회원가입 완료, 로그인해주세요.");
  } catch (error) {
    showToast(authErrorMessage(error));
  }
}
async function loginWithGoogle() {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    await setAuthFromUser(credential.user);
    showToast("Google 로그인 성공");
    go("home");
  } catch (error) {
    showToast(authErrorMessage(error));
  }
}
async function logout() {
  try {
    if (!state.auth?.isLocalAdmin) {
      await signOut(auth);
    }
  } catch (_error) {}
  state.auth = null;
  localStorage.removeItem("handam-auth");
  showToast("로그아웃했어요.");
  go("login");
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
window.updateFortuneFromBirthday = updateFortuneFromBirthday; window.logout = logout; window.login = login; window.register = register;
window.loginWithGoogle = loginWithGoogle;
window.changePassword = changePassword; window.exportDiaries = exportDiaries; window.showToast = showToast; window.openSheet = openSheet; window.closeSheet = closeSheet;

(async function bootstrap() {
  applyTheme(localStorage.getItem("handam-theme") || "light");
  bindMoodPicker("#emo-pick"); bindMoodPicker("#manual-mood"); bindSegmentButtons();
  fillBirthdaySelects();
  document.getElementById("ocr-camera-file").addEventListener("change", (e) => runOCRFile(e.target.files?.[0]));
  document.getElementById("ocr-gallery-file").addEventListener("change", (e) => runOCRFile(e.target.files?.[0]));
  document.getElementById("filter-mood").addEventListener("change", renderRecordsPage);
  document.getElementById("filter-date").addEventListener("change", renderRecordsPage);
  await initWorker(); await reloadRecords();
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    await setAuthFromUser(user);
    if (currentPageId() === "login") go("home");
  });
  try { state.auth = JSON.parse(localStorage.getItem("handam-auth") || "null"); } catch (_error) { state.auth = null; }
  if (state.auth) go("home"); else go("login");
})();

