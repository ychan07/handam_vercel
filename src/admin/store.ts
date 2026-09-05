import type { AdminBridgeOptions, AdminStats, AdminUser } from "./types";

export class AdminApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "AdminApiError"; }
}
export interface AdminSnapshot {
  data: { stats: AdminStats; users: AdminUser[] } | null;
  loading: boolean;
  error: string;
  updatedAt: string | null;
}
export class AdminStore {
  private snapshot: AdminSnapshot = { data: null, loading: false, error: "", updatedAt: null };
  private listeners = new Set<() => void>();
  private controllers = new Set<AbortController>();
  private refreshPromise: Promise<void> | null = null;
  private locks = new Set<string>();
  private disposed = false;
  constructor(private options: AdminBridgeOptions, private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  get alive() { return !this.disposed; }
  private publish(next: Partial<AdminSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach(fn => fn());
  }
  async request<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    if (this.disposed) throw new DOMException("Session closed", "AbortError");
    const session = this.options.getSession();
    if (!session) throw new DOMException("Session closed", "AbortError");
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const response = await this.fetcher(`/api/admin/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, adminToken: session.token }), signal: controller.signal,
      });
      if (this.disposed) throw new DOMException("Session closed", "AbortError");
      if (response.status === 401) {
        this.dispose();
        this.options.onLogout("관리자 세션이 만료되었어요. 다시 로그인해주세요.");
        throw new AdminApiError(401, "관리자 세션이 만료되었습니다.");
      }
      let body;
      try { body = await response.json(); } catch { throw new AdminApiError(response.status, "서버 응답을 읽지 못했어요. 다시 시도해주세요."); }
      if (this.disposed) throw new DOMException("Session closed", "AbortError");
      if (!response.ok) throw new AdminApiError(response.status, body.error || "요청을 처리하지 못했어요.");
      return body as T;
    } finally { this.controllers.delete(controller); }
  }
  refresh = (): Promise<void> => {
    if (this.refreshPromise) return this.refreshPromise;
    if (this.disposed) return Promise.reject(new DOMException("Session closed", "AbortError"));
    this.publish({ loading: true, error: "" });
    this.refreshPromise = Promise.all([
      this.request<AdminStats>("stats"), this.request<{ users: AdminUser[] }>("users"),
    ]).then(([stats, { users }]) => {
      this.publish({ data: { stats, users }, updatedAt: new Date().toISOString() });
    }).catch(error => {
      this.publish({ error: error instanceof Error ? error.message : "최신 정보를 불러오지 못했어요." });
      throw error;
    }).finally(() => { this.refreshPromise = null; this.publish({ loading: false }); });
    return this.refreshPromise;
  };
  async mutate<T>(key: string, action: string, payload: Record<string, unknown>): Promise<T> {
    if (this.locks.has(key)) throw new AdminApiError(409, "이미 처리 중인 작업입니다.");
    this.locks.add(key);
    try { return await this.request<T>(action, payload); }
    finally { this.locks.delete(key); }
  }
  dispose() {
    this.disposed = true;
    this.controllers.forEach(controller => controller.abort());
    this.controllers.clear(); this.locks.clear(); this.listeners.clear();
    this.snapshot = { data: null, loading: false, error: "", updatedAt: null };
  }
}
