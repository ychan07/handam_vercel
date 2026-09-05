import { describe, expect, it } from "vitest";
import { absoluteDate, paginate, passwordErrors, relativeDate, selectUsers, usersCsv } from "../../src/admin/model";
import { usersFixture } from "./fixtures";
describe("admin list", () => {
  it.each([0, 1, 20, 21, 1000])("paginates %i users without losing results", count => {
    const users = selectUsers(usersFixture(count), "", "all", "created");
    const pages = Math.max(1, Math.ceil(count / 20));
    expect(paginate(users, 1, 20).users).toHaveLength(Math.min(20, count));
    expect(paginate(users, 10000, 20).page).toBe(pages);
    expect(Array.from({ length: pages }, (_, i) => paginate(users, i + 1, 20).users).flat()).toHaveLength(count);
  });
  it("searches names, email and UID; sorts without mutating the input", () => {
    const users = usersFixture(1000);
    expect(selectUsers(users, "UID-0999", "all", "created")[0].uid).toBe("uid-0999");
    expect(selectUsers(users, "diary13@", "all", "created")).toHaveLength(1);
    expect(selectUsers(users, "김하늘", "all", "name").every(u => u.displayName?.includes("김하늘"))).toBe(true);
    expect(selectUsers(users, "", "disabled", "created").every(u => u.disabled)).toBe(true);
    expect(selectUsers(users, "", "active", "activity").every(u => u.active)).toBe(true);
    expect(users[0].uid).toBe("uid-0000");
  });
  it("clamps after the last user on page 2 is removed", () => expect(paginate(usersFixture(20), 2, 20).page).toBe(1));
  it("exports all filtered results with quoting and formula protection", () => {
    const users = usersFixture(1000); users[0].displayName = '=HYPERLINK("x")';
    const filtered = selectUsers(users, "", "active", "created");
    const csv = usersCsv(filtered);
    expect(csv.split("\r\n")).toHaveLength(filtered.length + 1);
    expect(csv).toContain("'=" ); expect(csv).toContain('""x""'); expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
  it("formats missing and Korean-time dates and keeps password whitespace", () => {
    expect(absoluteDate(null)).toBe("기록 없음"); expect(relativeDate(null)).toBe("기록 없음");
    expect(absoluteDate("2026-01-01T23:30:00Z")).toContain("2026. 01. 02.");
    expect(passwordErrors(" a234 ", " a234 ", 6).password).toBe("");
    expect(passwordErrors("123", "123", 4).password).not.toBe("");
    expect(passwordErrors("123456", "12345", 6).confirmation).not.toBe("");
  });
});
