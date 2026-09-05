import { test, expect } from "@playwright/test";
import { usersFixture, statsFixture } from "../admin/fixtures";
import { mkdirSync } from "node:fs";

test("real application login, admin bridge, logout, home, settings and loading regression", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const firebase: Record<string, string> = {
    "firebase-app.js": "export const initializeApp = () => ({});",
    "firebase-analytics.js": "export const isSupported = async () => false; export const getAnalytics = () => ({});",
    "firebase-auth.js": `
      const auth = { currentUser: null }; const listeners = [];
      export const getAuth = () => auth;
      export const onAuthStateChanged = (a, callback) => { listeners.push(callback); queueMicrotask(() => callback(a.currentUser)); return () => {}; };
      export const signInWithEmailAndPassword = async () => { const user = {uid:'test-user',email:'reader@example.test',displayName:'테스트 독자',getIdToken:async()=> 'test-id-token'}; auth.currentUser=user; return {user}; };
      export const signOut = async () => {auth.currentUser=null; listeners.forEach(fn=>fn(null));};
      export const createUserWithEmailAndPassword = signInWithEmailAndPassword;
      export const signInWithPopup = signInWithEmailAndPassword;
      export const updatePassword = async () => {};
      export const updateProfile = async () => {};
      export const sendPasswordResetEmail = async () => {};
      export const reauthenticateWithCredential = async () => {};
      export const EmailAuthProvider = {credential:()=>({})};
      export class GoogleAuthProvider {setCustomParameters(){}}
    `,
    "firebase-firestore.js": `
      export const getFirestore=()=>({}); export const collection=(...args)=>args; export const doc=(...args)=>args;
      export const deleteDoc=async()=>{}; export const getDoc=async()=>({exists:()=>true,data:()=>({migrationVersion:1,displayName:'테스트 독자',settings:{}})});
      export const getDocs=async()=>({docs:[]}); export const orderBy=(...args)=>args; export const query=(...args)=>args;
      export const serverTimestamp=()=>null; export const setDoc=async()=>{}; export const writeBatch=()=>({set(){},commit:async()=>{}});
      export const Timestamp={fromDate:date=>date};
    `,
  };
  await page.route("https://www.gstatic.com/firebasejs/**", route => route.fulfill({ contentType: "text/javascript", body: firebase[new URL(route.request().url()).pathname.split("/").pop()!] || "" }));
  await page.route("**/db-worker.js", route => route.fulfill({ contentType: "text/javascript", body: "self.onmessage=e=>self.postMessage({id:e.data.id,data:e.data.type==='list'?[]:{ok:true}});" }));
  const users = usersFixture(1);
  await page.route("**/api/**", route => {
    const action = new URL(route.request().url()).pathname.split("/").pop();
    const body = action === "login" ? { token: "mock-admin", username: "운영자" } : action === "stats" ? statsFixture(users) : action === "users" ? { users } : { ok: true };
    return route.fulfill({ json: body });
  });
  await page.goto("/");
  await expect(page.locator(".splash-screen")).toBeVisible();
  await expect(page.locator("#page-login")).toHaveClass(/active/);
  await expect(page.locator("#splash-root")).toHaveCount(0, { timeout: 12000 });
  await page.locator("#login-email").fill("operator"); await page.locator("#login-password").fill("mock password");
  await page.locator('#page-login button[onclick="login()"] ').click();
  await expect(page.getByRole("heading", { name: "한담 관리자", exact: true })).toBeVisible(); await expect(page.locator(".device")).toBeHidden();
  await page.getByRole("button", { name: "계정 설정", exact: true }).click(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator("#admin-root")).toBeHidden(); await expect(page.locator(".device")).toBeVisible();
  expect(await page.locator("#admin-portals").evaluate(el => el.children.length)).toBe(0);
  await page.locator("#login-email").fill("reader@example.test"); await page.locator("#login-password").fill("mock password"); await page.locator('#page-login button[onclick="login()"] ').click();
  await expect(page.locator("#page-home")).toHaveClass(/active/);
  await expect(page.locator("#home-greeting")).toContainText("테스트 독자");
  mkdirSync("output/playwright/captures", { recursive: true }); await page.screenshot({ path: "output/playwright/captures/regression-home.png" });
  await page.locator('.bottom-nav [data-page="settings"]').click(); await expect(page.locator("#page-settings")).toHaveClass(/active/);
  expect(await page.locator("#page-settings .list-item").first().evaluate(el => getComputedStyle(el).display)).toBe("flex");
  expect(await page.locator(".device").evaluate(el => el.getBoundingClientRect().width)).toBe(390);
  await page.screenshot({ path: "output/playwright/captures/regression-settings.png" });
  await page.evaluate(() => window.handamFortuneLoading!.show({ westernZodiac: "양자리", chineseZodiac: "말", onDone: () => {} }));
  await expect(page.locator(".fortune-loading-screen")).toBeVisible();
  await expect(page.locator(".fortune-loading-screen")).toHaveCount(0, { timeout: 12000 });
  expect(await page.locator("body").getAttribute("data-scroll-locked")).toBeNull();
  expect(errors).toEqual([]);
});
