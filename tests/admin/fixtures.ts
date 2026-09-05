import type { AdminStats, AdminUser } from "../../src/admin/types";
export const usersFixture = (count: number): AdminUser[] => Array.from({ length: count }, (_, index) => ({
  uid: `uid-${String(index).padStart(4, "0")}`, displayName: ["김하늘", "이서연", "박도윤", "정수빈", "최유진", "윤지호"][index % 6] + (index < 6 ? "" : ` ${index}`),
  email: index === 2 ? "a.very.long.email.address.for.mobile.layout.check@example.handam.test" : `diary${index}@example.test`,
  disabled: index % 7 === 6, active: index % 3 === 0, phone: null,
  createdAt: new Date(Date.UTC(2026, 8, 5) - index * 86400000).toISOString(),
  lastSignIn: new Date(Date.now() - index * 3600000).toISOString(),
  lastSeen: new Date(Date.now() - index * 60000).toISOString(), providers: ["password"],
}));
export const statsFixture = (users: AdminUser[]): AdminStats => ({ totalUsers: users.length, activeUsers: users.filter(u => u.active).length, disabledUsers: users.filter(u => u.disabled).length, emailUsers: users.filter(u => u.email).length, activeWindowMinutes: 15, firebaseConfigured: true, firestoreEnabled: true, activeSource: "presence" });
