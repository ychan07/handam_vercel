import type { AdminUser, UserFilter, UserSort } from "./types";

export const userName = (user: AdminUser) => user.displayName || user.email?.split("@")[0] || "이름 없음";
const timestamp = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export function selectUsers(users: AdminUser[], query: string, filter: UserFilter, sort: UserSort) {
  const term = query.trim().toLocaleLowerCase("ko");
  return users.filter(user =>
    (filter !== "active" || user.active) && (filter !== "disabled" || user.disabled) &&
    `${user.displayName || ""} ${user.email || ""} ${user.uid}`.toLocaleLowerCase("ko").includes(term)
  ).sort((a, b) => {
    const delta = sort === "name" ? userName(a).localeCompare(userName(b), "ko") : sort === "activity"
      ? timestamp(b.lastSeen || b.lastSignIn) - timestamp(a.lastSeen || a.lastSignIn)
      : timestamp(b.createdAt) - timestamp(a.createdAt);
    return delta || a.uid.localeCompare(b.uid);
  });
}
export function paginate(users: AdminUser[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(users.length / size));
  const current = Math.max(1, Math.min(page, pages));
  return { page: current, pages, users: users.slice((current - 1) * size, current * size) };
}
export function absoluteDate(value: string | null) {
  if (!timestamp(value)) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value!));
}
export function relativeDate(value: string | null, now = Date.now()) {
  if (!timestamp(value)) return "기록 없음";
  const minutes = Math.max(0, Math.floor((now - timestamp(value)) / 60000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}
export function usersCsv(users: AdminUser[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    // Treat spreadsheet formulas as text, including leading whitespace.
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows: unknown[][] = [["uid", "displayName", "email", "disabled", "active", "createdAt", "lastSignIn", "lastSeen", "providers"]];
  users.forEach(u => rows.push([u.uid, u.displayName, u.email, u.disabled, u.active, u.createdAt, u.lastSignIn, u.lastSeen, u.providers.join("|")]));
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}
export function passwordErrors(password: string, confirmation: string, minimum: number) {
  return {
    password: password.length < minimum ? `${minimum}자 이상 입력해주세요. 공백도 비밀번호에 포함됩니다.` : "",
    confirmation: confirmation !== password ? "비밀번호가 일치하지 않습니다." : "",
  };
}
