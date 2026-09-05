import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { usersFixture, statsFixture } from "../admin/fixtures";

async function setup(page: Page, count = 21) {
  const state = { users: usersFixture(count), calls: [] as string[], payloads: [] as Record<string, unknown>[], fail: "", mutationError: "", delay: 0, expired: false, connected: true };
  await page.route("**/api/admin/**", async route => {
    const action = new URL(route.request().url()).pathname.split("/").pop()!;
    const body = route.request().postDataJSON(); state.calls.push(action); state.payloads.push(body);
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (state.expired) return route.fulfill({ status: 401, json: { error: "만료" } });
    if (action === state.fail) return route.fulfill({ status: 500, json: { error: "서버 연결을 확인해주세요." } });
    if (["credentials", "reset-password", "toggle-user", "delete-user"].includes(action) && state.mutationError) return route.fulfill({ status: 400, json: { error: state.mutationError } });
    if (action === "stats") return route.fulfill({ json: { ...statsFixture(state.users), firebaseConfigured: state.connected } });
    if (action === "users") return route.fulfill({ json: { users: state.users } });
    if (action === "toggle-user") state.users.find(user => user.uid === body.uid)!.disabled = body.disabled;
    if (action === "delete-user") state.users = state.users.filter(user => user.uid !== body.uid);
    if (action === "credentials") return route.fulfill({ json: { username: body.newUsername || "한담지기", token: "updated-token" } });
    if (action === "reset-link") return route.fulfill({ json: { link: "https://example.test/reset?oobCode=mock-only" } });
    return route.fulfill({ json: { ok: true } });
  });
  return state;
}
async function enter(page: Page) { await page.goto("/tests/admin.html"); await expect(page.locator(".adm-user-grid .adm-user").first()).toBeVisible(); }
async function capture(page: Page, name: string) { mkdirSync("output/playwright/captures", { recursive: true }); await page.screenshot({ path: `output/playwright/captures/${name}.png`, fullPage: true }); }
async function noOverflow(page: Page) {
  expect(await page.locator("#admin-app").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const panel = page.locator(".adm-sheet");
  if (await panel.count()) expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}

for (const width of [360, 390, 768, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`layout ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 }); await setup(page, 1000); await enter(page);
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await noOverflow(page); await expect(page.locator(".adm-user")).toHaveCount(20);
      expect(await page.locator(".adm-user-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(width >= 768 ? 2 : 1);
      await capture(page, `overview-${width}-${theme}`);
      await page.locator("#admin-app").evaluate(el => { el.scrollTop = (document.querySelector(".adm-users") as HTMLElement).offsetTop + 16; });
      await capture(page, `list-${width}-${theme}`);
      await page.getByRole("button", { name: "박도윤 상세 보기", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "사용자 상세" })).toBeVisible(); await noOverflow(page);
      if (width === 390 && theme === "light") await capture(page, "mobile-detail");
      await page.getByRole("button", { name: "계정 삭제", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      const dialogBounds = (await page.getByRole("alertdialog").boundingBox())!;
      expect(dialogBounds.x).toBeGreaterThanOrEqual(0); expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(width);
      expect(dialogBounds.y).toBeGreaterThanOrEqual(0);
      if (width === 390 && theme === "light") await capture(page, "mobile-confirm");
      await page.getByRole("button", { name: "취소", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "계정 삭제", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "박도윤 상세 보기", exact: true })).toBeFocused();
      expect(await page.locator("#admin-portals").evaluate(el => el.children.length)).toBe(0);
      expect(await page.locator("body").getAttribute("data-scroll-locked")).toBeNull();
    });
  }
}
test("search, sort, 20/50/100, CSV covers all matches and detail preserves page", async ({ page }) => {
  await setup(page, 1000); await enter(page);
  await page.getByRole("button", { name: "다음 페이지" }).click(); await expect(page.locator(".adm-page-number")).toHaveText("2 / 50 페이지");
  const first = page.locator(".adm-user").first().getByRole("button"); await first.click(); await page.keyboard.press("Escape"); await expect(page.locator(".adm-page-number")).toHaveText("2 / 50 페이지");
  await page.getByLabel("이름·이메일·UID 검색").fill("uid-0999"); await expect(page.locator(".adm-user")).toHaveCount(1); await expect(page.locator(".adm-page-number")).toHaveText("1 / 1 페이지");
  await page.getByLabel("이름·이메일·UID 검색").fill("");
  await page.getByRole("combobox", { name: "페이지당 사용자 수" }).click(); await page.getByRole("option", { name: "50명씩" }).click(); await expect(page.locator(".adm-user")).toHaveCount(50);
  await page.getByRole("combobox", { name: "페이지당 사용자 수" }).click(); await page.getByRole("option", { name: "100명씩" }).click(); await expect(page.locator(".adm-user")).toHaveCount(100);
  await page.getByRole("combobox", { name: "사용자 정렬" }).click(); await page.getByRole("option", { name: "이름순" }).click();
  await page.getByRole("radio", { name: "최근 활동", exact: true }).click();
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "CSV 334명" }).click();
  const stream = await (await downloadPromise).createReadStream(); let csv = ""; for await (const chunk of stream!) csv += chunk;
  expect(csv.split("\r\n")).toHaveLength(335);
});
test("toggle updates stats and list, delete clamps last page", async ({ page }) => {
  const state = await setup(page); await enter(page);
  await page.getByRole("button", { name: "김하늘 상세 보기", exact: true }).click();
  await page.getByRole("button", { name: "계정 정지", exact: true }).click();
  await page.getByRole("button", { name: "계정 정지 확인" }).click();
  await expect(page.getByRole("button", { name: "계정 정지 해제", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); expect(state.calls.slice(-2).sort()).toEqual(["stats", "users"]);
  await expect(page.locator(".adm-metric").nth(3).locator(".adm-number")).toHaveText("4명");
  await page.getByRole("button", { name: "다음 페이지" }).click(); await page.locator(".adm-user").getByRole("button").click();
  await page.getByRole("button", { name: "계정 삭제", exact: true }).click(); await page.getByRole("button", { name: "계정 삭제 확인" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.locator(".adm-page-number")).toHaveText("1 / 1 페이지");
  await expect(page.locator(".adm-metric").first().locator(".adm-number")).toHaveText("20명");
});
test("partial failure preserves data; mutation success with failed refresh is explicit", async ({ page }) => {
  const state = await setup(page); await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  const before = await page.locator(".adm-updated").innerText(); state.fail = "users";
  await page.getByRole("button", { name: "목록과 통계 새로고침" }).click(); await expect(page.getByText("최신 정보를 불러오지 못했어요", { exact: true })).toBeVisible();
  await expect(page.locator(".adm-user")).toHaveCount(20); await expect(page.locator(".adm-updated")).toHaveText(before); await capture(page, "mobile-error");
  state.fail = ""; await page.getByRole("button", { name: "다시 불러오기", exact: true }).click(); await expect(page.getByText("최신 정보를 불러오지 못했어요", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "김하늘 상세 보기", exact: true }).click(); state.fail = "users";
  await page.getByRole("button", { name: "계정 정지", exact: true }).click(); await page.getByRole("button", { name: "계정 정지 확인" }).click();
  await expect(page.getByRole("dialog").getByText("작업 완료, 최신 정보 확인 필요", { exact: true })).toBeVisible(); expect(state.calls.filter(action => action === "toggle-user")).toHaveLength(1);
});
test("password validation preserves spaces and errors, clipboard fallback", async ({ page }) => {
  const state = await setup(page, 1); await enter(page);
  await page.getByRole("button", { name: "김하늘 상세 보기", exact: true }).click();
  await page.getByRole("button", { name: "비밀번호 초기화", exact: true }).click(); await expect(page.locator("#user-password")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#user-password").fill(" abcde "); await page.locator("#user-confirm").fill("wrong"); await page.getByRole("button", { name: "비밀번호 초기화", exact: true }).click(); await expect(page.locator("#user-confirm")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#user-confirm").fill(" abcde "); state.mutationError = "초기화 실패";
  await page.getByRole("button", { name: "비밀번호 초기화", exact: true }).click(); await expect(page.getByText("초기화 실패", { exact: true })).toBeVisible(); await expect(page.locator("#user-password")).toHaveValue(" abcde ");
  state.mutationError = ""; await page.getByRole("button", { name: "비밀번호 초기화", exact: true }).click(); await expect(page.locator("#user-password")).toHaveValue("");
  expect(state.payloads.find(payload => payload.newPassword)?.newPassword).toBe(" abcde ");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }));
  await page.getByRole("button", { name: "링크 생성·복사" }).click(); await expect(page.getByLabel("복사하지 못했어요. 링크를 선택해 복사해주세요.")).toHaveValue(/mock-only/);
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "김하늘 상세 보기", exact: true }).click(); await expect(page.locator("#reset-link")).toHaveCount(0);
});
test("settings validations, failed current password and immediate session update", async ({ page }) => {
  const state = await setup(page, 1); await enter(page); await page.getByRole("button", { name: "계정 설정", exact: true }).click();
  await expect(page.getByRole("button", { name: "변경 사항 저장" })).toBeDisabled();
  await page.locator("#settings-username").fill("새로운 한담지기"); await page.getByRole("button", { name: "변경 사항 저장" }).click(); await expect(page.locator("#settings-current")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#settings-current").fill("wrong"); state.mutationError = "현재 관리자 비밀번호가 일치하지 않습니다.";
  await page.getByRole("button", { name: "변경 사항 저장" }).click(); await expect(page.locator("#settings-current-error")).toBeVisible();
  state.mutationError = ""; await page.locator("#settings-current").fill("correct"); await page.locator("#settings-password").fill("123"); await page.locator("#settings-confirmation").fill("123");
  await page.getByRole("button", { name: "변경 사항 저장" }).click(); await expect(page.locator("#settings-password-error")).toBeVisible();
  await page.locator("#settings-password").fill(" ab "); await page.locator("#settings-confirmation").fill(" ab "); await page.getByRole("button", { name: "변경 사항 저장" }).click();
  await expect(page.locator("#settings-current")).toHaveValue(""); await page.keyboard.press("Escape"); await expect(page.locator(".adm-session")).toContainText("새로운 한담지기");
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("handam-admin")!).token)).toBe("updated-token");
});
test("loading, expired session and logout before response", async ({ page }) => {
  const state = await setup(page); state.delay = 500; await page.goto("/tests/admin.html");
  await expect(page.getByLabel("사용자 목록 로딩")).toBeVisible(); await expect(page.locator(".adm-user")).toHaveCount(20);
  state.expired = true; await page.getByRole("button", { name: "목록과 통계 새로고침" }).click();
  await expect(page.getByText("관리자 세션이 만료되었어요. 다시 로그인해주세요.", { exact: true })).toBeVisible(); await expect(page.locator("#admin-root")).toBeHidden();
  state.expired = false; state.delay = 1500; await page.goto("/tests/admin.html"); await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator("#admin-root")).toBeHidden(); await page.waitForTimeout(1600); await expect(page.locator(".adm-user")).toHaveCount(0); await expect(page.locator(".device")).toBeVisible();
});
test("empty, disconnected, first failure and retry states are distinct", async ({ page }) => {
  const state = await setup(page, 0); state.fail = "stats"; await page.goto("/tests/admin.html");
  await expect(page.getByText("사용자 정보를 불러오지 못했어요", { exact: true })).toBeVisible(); await expect(page.locator(".adm-number").first()).toHaveText("—명");
  state.fail = ""; await page.getByRole("button", { name: "다시 불러오기" }).click(); await expect(page.getByText("아직 등록된 사용자가 없어요")).toBeVisible();
  state.connected = false; await page.getByRole("button", { name: "목록과 통계 새로고침" }).click(); await expect(page.getByText("사용자 관리 서버가 연결되지 않았어요")).toBeVisible();
  state.connected = true; state.users = usersFixture(1); await page.getByRole("button", { name: "목록과 통계 새로고침" }).click(); await expect(page.locator(".adm-user")).toHaveCount(1);
  await page.getByLabel("이름·이메일·UID 검색").fill("없음"); await expect(page.getByText("검색 결과가 없어요")).toBeVisible(); await page.getByRole("button", { name: "검색·필터 초기화" }).click(); await expect(page.locator(".adm-user")).toHaveCount(1);
});
test("keyboard focus, reduced motion, zoom and virtual keyboard resize", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" }); await setup(page, 1); await enter(page);
  await page.getByRole("button", { name: "계정 설정", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "계정 설정" })).toBeVisible();
  for (let index = 0; index < 15; index++) { await page.keyboard.press("Tab"); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); }
  await page.evaluate(() => { Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 420 }); window.visualViewport!.dispatchEvent(new Event("resize")); });
  expect((await page.locator(".adm-sheet").boundingBox())!.height).toBeLessThanOrEqual(420); await noOverflow(page); await capture(page, "mobile-keyboard-resize");
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "계정 설정", exact: true })).toBeFocused();
  const cdp = await page.context().newCDPSession(page); await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 450, deviceScaleFactor: 2, mobile: false }); await noOverflow(page);
  expect(await page.locator('meta[name="viewport"]').getAttribute("content")).not.toContain("user-scalable=no");
});

test("repeated clicks keep one mutation in flight and allow recovery", async ({page}) => {
  const state = await setup(page,1); await enter(page); state.delay=300;
  await page.getByRole("button",{name:"김하늘 상세 보기",exact:true}).click();
  await page.getByRole("button",{name:"계정 정지",exact:true}).click();
  await page.getByRole("button",{name:"계정 정지 확인"}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
  await expect(page.getByRole("button",{name:"처리 중…",exact:true})).toBeDisabled();
  await expect(page.getByRole("button",{name:"계정 정지 해제",exact:true})).toBeEnabled();
  expect(state.calls.filter(action=>action==="toggle-user")).toHaveLength(1);
  await page.getByRole("button",{name:"계정 정지 해제",exact:true}).click();
  await page.getByRole("button",{name:"정지 해제 확인"}).click();
  await expect(page.getByRole("button",{name:"계정 정지",exact:true})).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator(".adm-metric").nth(3).locator(".adm-number")).toHaveText("0명");
});
