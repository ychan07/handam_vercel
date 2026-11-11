import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function setup(page: Page, theme = "light", longProfile = false) {
  const model = {
    fail: false, delay: 0, writes: [] as Record<string, unknown>[],
    settings: { theme, recordReminder: true, summaryQuality: "고급", persona: "따뜻한 공감형", lunarCalendar: false, fortuneBirthday: "" },
  };
  const displayName = longProfile ? "긴이름으로도읽을수있는한담사용자프로필" : "테스트 독자";
  const email = longProfile ? "long.reader.address.for.layout@example.test" : "reader@example.test";
  const modules: Record<string, string> = {
    "firebase-app.js": "export const initializeApp=()=>({});",
    "firebase-analytics.js": "export const isSupported=async()=>false; export const getAnalytics=()=>({});",
    "firebase-auth.js": `
      const user={uid:'settings-test',email:${JSON.stringify(email)},displayName:${JSON.stringify(displayName)},getIdToken:async()=>'mock-token'};
      const auth={currentUser:user};const listeners=[];
      export const getAuth=()=>auth;
      export const onAuthStateChanged=(a,cb)=>{listeners.push(cb);queueMicrotask(()=>cb(a.currentUser));return()=>{}};
      export const signOut=async()=>{auth.currentUser=null;listeners.forEach(cb=>cb(null));};
      export const signInWithEmailAndPassword=async()=>({user});
      export const signInWithPopup=signInWithEmailAndPassword;
      export const createUserWithEmailAndPassword=signInWithEmailAndPassword;
      export const updatePassword=async()=>{};export const updateProfile=async()=>{};
      export const sendPasswordResetEmail=async()=>{};export const reauthenticateWithCredential=async()=>{};
      export const EmailAuthProvider={credential:()=>({})};export class GoogleAuthProvider{setCustomParameters(){}}
    `,
    "firebase-firestore.js": `
      export const getFirestore=()=>({});export const collection=(...a)=>a;export const doc=(...a)=>a;
      export const getDoc=async()=>({exists:()=>true,data:()=>(${JSON.stringify({ migrationVersion: 1, displayName, settings: model.settings })})});
      export const getDocs=async()=>({docs:[]});export const orderBy=(...a)=>a;export const query=(...a)=>a;
      export const serverTimestamp=()=>null;export const Timestamp={fromDate:d=>d};
      export const setDoc=async(ref,data)=>{const res=await fetch('/__mock/settings',{method:'POST',body:JSON.stringify(data)});if(!res.ok)throw Error('mock sync failure');};
      export const deleteDoc=async()=>{};export const writeBatch=()=>({set(){},commit:async()=>{}});
    `,
  };
  await page.route("https://www.gstatic.com/firebasejs/**", route => route.fulfill({ contentType: "text/javascript", body: modules[new URL(route.request().url()).pathname.split("/").pop()!] || "" }));
  await page.route("**/db-worker.js", route => route.fulfill({ contentType: "text/javascript", body: "self.onmessage=e=>self.postMessage({id:e.data.id,data:e.data.type==='list'?[]:{ok:true}});" }));
  await page.route("**/api/**", route => route.fulfill({ json: { ok: true } }));
  await page.route("**/__mock/settings", async route => {
    const body = route.request().postDataJSON();
    model.writes.push(body);
    if (model.delay) await new Promise(resolve => setTimeout(resolve, model.delay));
    if (!model.fail) model.settings = body.settings;
    await route.fulfill({ status: model.fail ? 503 : 200, json: { ok: !model.fail } });
  });
  await page.goto("/");
  await expect(page.locator("#page-home")).toHaveClass(/active/);
  await expect(page.locator("#splash-root")).toHaveCount(0, { timeout: 12000 });
  await page.locator('.bottom-nav [data-page="settings"]').click();
  await expect(page.locator("#settings-display-name")).toHaveText(displayName);
  await page.locator("#page-settings").evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
  });
  return model;
}

for (const width of [360, 390, 768]) for (const theme of ["light", "dark"]) {
  test(`settings layout ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page, theme, width === 360);
    const settings = page.locator("#page-settings");
    await expect(page.getByRole("heading", { name: "마이페이지", exact: true })).toBeVisible();
    await expect(page.locator(".bottom-nav").getByRole("button", { name: "마이페이지", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".bottom-nav .nav-item")).toHaveText(["홈", "나의 기록", "분석", "회고", "마이페이지"]);
    await expect(settings.getByText("한담 PRO")).toHaveCount(0);
    await expect(settings.getByText("기록 알림", { exact: true })).toHaveCount(0);
    await expect(settings.getByText("준비 중", { exact: true })).toHaveCount(0);
    await expect(settings.getByText("요금제에 따라 달라요", { exact: true })).toHaveCount(0);
    await expect(settings.locator(".seg-pill").first()).toBeHidden();
    await expect(settings.locator("[onclick]")).toHaveCount(0);
    for (const button of await settings.locator("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await settings.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const overflow = await settings.locator(".settings-identity, .list-item, .seg button").evaluateAll(elements => elements.some(el => el.scrollWidth > el.clientWidth + 1));
    expect(overflow).toBe(false);
    // Check both muted and accent text against the darkest light surface or lightest dark surface.
    const contrast = await settings.evaluate(el => {
      const style = getComputedStyle(el);
      const luminance = (hex: string) => {
        const rgb = hex.replace("#", "").match(/../g)!.map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const background = luminance(document.documentElement.dataset.theme === "dark" ? "#2A261C" : "#EDE6D8");
      return ["--text-muted", "--accent"].map(token => {
        const foreground = luminance(style.getPropertyValue(token).trim());
        return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05);
      });
    });
    contrast.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(4.5));
    mkdirSync("output/playwright/captures", { recursive: true });
    await page.screenshot({ path: `output/playwright/captures/settings-${width}-${theme}.png` });
    await settings.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const logout = await settings.getByRole("button", { name: "로그아웃" }).boundingBox();
    const nav = await page.locator(".bottom-nav").boundingBox();
    expect(logout!.y).toBeGreaterThanOrEqual(0);
    expect(logout!.y + logout!.height).toBeLessThanOrEqual(nav!.y);
    await page.screenshot({ path: `output/playwright/captures/settings-${width}-${theme}-bottom.png` });
  });
}

test("settings keyboard controls, navigation and existing preference contract", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const model = await setup(page);
  const toggle = page.getByRole("switch", { name: "다크 모드" });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(await toggle.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "균형", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "섬세", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#settings-quality-help")).toContainText("감정의 뉘앙스");
  await page.keyboard.press("Home");
  await expect(page.getByRole("radio", { name: "간결", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "따뜻한 공감형" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "담백한 정리형" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#settings-persona-help")).toContainText("차분하고 간결하게");
  await expect.poll(() => model.settings.persona).toBe("담백한 정리형");
  expect(model.settings).toMatchObject({ theme: "light", recordReminder: true, summaryQuality: "표준", lunarCalendar: false, fortuneBirthday: "" });
  for (const group of await page.getByRole("radiogroup").all()) {
    await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);
    await expect(group.locator('[tabindex="0"]')).toHaveCount(1);
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "비밀번호 변경", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#page-password")).toHaveClass(/active/);
  await page.locator("#page-password .iconbtn").click();
  await page.getByRole("button", { name: "일기 백업 · 내보내기" }).click();
  await expect(page.locator("#page-backup")).toHaveClass(/active/);
  await page.locator("#page-backup .iconbtn").click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).press("Enter");
  await expect(page.locator("#page-login")).toHaveClass(/active/);
});

test("settings report pending sync, failure and recovery without losing local choice", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const model = await setup(page);
  model.delay = 350;
  model.fail = true;
  const choice = page.getByRole("radio", { name: "섬세", exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-checked", "true");
  const toast = page.locator("#toast");
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast).toHaveAttribute("aria-live", "polite");
  await expect(toast).toContainText("동기화하고 있어요");
  await expect(toast).toContainText("계정 동기화에 실패했어요");
  await expect(choice).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("handam-settings-settings-test")!).summaryQuality)).toBe("최고");
  expect(model.settings.summaryQuality).toBe("고급");
  model.fail = false;
  await choice.click();
  await expect(toast).toHaveText("설정을 계정에 동기화했어요.");
  expect(model.settings.summaryQuality).toBe("최고");
});
