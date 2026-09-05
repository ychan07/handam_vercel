export interface AdminSession { token: string; username: string }
export interface AdminUser {
  uid: string;
  email: string | null;
  phone?: string | null;
  displayName: string | null;
  disabled: boolean;
  createdAt: string | null;
  lastSignIn: string | null;
  lastSeen: string | null;
  active: boolean;
  providers: string[];
}
export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  emailUsers: number;
  activeWindowMinutes: number;
  firebaseConfigured: boolean;
  firestoreEnabled: boolean;
  activeSource: string;
}
export interface AdminBridgeOptions {
  getSession: () => AdminSession | null;
  onSessionChange: (session: AdminSession) => void;
  onLogout: (message?: string) => void;
}
export type UserFilter = "all" | "active" | "disabled";
export type UserSort = "created" | "activity" | "name";
