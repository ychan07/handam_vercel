import { describe, expect, it, vi } from "vitest";
import { AdminApiError, AdminStore } from "../../src/admin/store";
import { statsFixture, usersFixture } from "./fixtures";
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const options = () => ({ getSession: () => ({ token: "mock", username: "admin" }), onLogout: vi.fn(), onSessionChange: vi.fn() });
describe("atomic admin state", () => {
  it("fetches in parallel, deduplicates clicks and publishes only a complete pair", async () => {
    const a = deferred<Response>(), b = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const store = new AdminStore(options(), fetcher);
    const first = store.refresh(); const second = store.refresh();
    expect(first).toBe(second); expect(fetcher).toHaveBeenCalledTimes(2);
    a.resolve(response(statsFixture(usersFixture(21)))); await Promise.resolve();
    expect(store.getSnapshot().data).toBeNull();
    b.resolve(response({ users: usersFixture(21) })); await first;
    expect(store.getSnapshot().data?.users).toHaveLength(21);
  });
  it("keeps previous data and timestamp when either request fails", async () => {
    const users = usersFixture(1);
    const fetcher = vi.fn().mockResolvedValueOnce(response(statsFixture(users))).mockResolvedValueOnce(response({ users })).mockResolvedValueOnce(response(statsFixture([]))).mockResolvedValueOnce(response({ error: "목록 오류" }, 500));
    const store = new AdminStore(options(), fetcher); await store.refresh(); const before = store.getSnapshot();
    await expect(store.refresh()).rejects.toMatchObject({ status: 500 });
    expect(store.getSnapshot().data).toBe(before.data); expect(store.getSnapshot().updatedAt).toBe(before.updatedAt);
    expect(store.getSnapshot().error).toBe("목록 오류");
  });
  it("expires once and prevents a late response from restoring a disposed session", async () => {
    const late = deferred<Response>(); const opts = options();
    const store = new AdminStore(opts, vi.fn().mockResolvedValueOnce(response({}, 401)).mockReturnValueOnce(late.promise));
    await expect(store.refresh()).rejects.toBeInstanceOf(AdminApiError);
    late.resolve(response({ users: usersFixture(1) })); await new Promise(resolve => setTimeout(resolve, 0));
    expect(opts.onLogout).toHaveBeenCalledTimes(1); expect(store.getSnapshot().data).toBeNull();
  });
  it("aborts all reads on logout and ignores responses even if fetch ignores abort", async () => {
    const a = deferred<Response>(), b = deferred<Response>(); const signals: AbortSignal[] = [];
    const store = new AdminStore(options(), vi.fn().mockImplementation((_url, init) => { signals.push(init.signal); return signals.length === 1 ? a.promise : b.promise; }));
    const work = store.refresh(); store.dispose();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    a.resolve(response(statsFixture([]))); b.resolve(response({ users: [] }));
    await expect(work).rejects.toMatchObject({ name: "AbortError" }); expect(store.getSnapshot().data).toBeNull();
  });
  it("locks duplicate mutations for the same user and preserves HTTP status", async () => {
    const gate = deferred<Response>(); const fetcher = vi.fn().mockReturnValue(gate.promise);
    const store = new AdminStore(options(), fetcher); const work = store.mutate("uid", "toggle-user", { uid: "uid", disabled: true });
    await expect(store.mutate("uid", "delete-user", { uid: "uid" })).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1); gate.resolve(response({ error: "잘못된 요청" }, 400));
    await expect(work).rejects.toMatchObject({ status: 400 });
  });
  it("a late response from a failed refresh cannot overwrite a newer complete snapshot", async () => {
    const oldUsers = deferred<Response>();
    const latest = usersFixture(20);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({error:"stats failed"},500)).mockReturnValueOnce(oldUsers.promise)
      .mockResolvedValueOnce(response(statsFixture(latest))).mockResolvedValueOnce(response({users:latest}));
    const store = new AdminStore(options(),fetcher);
    await expect(store.refresh()).rejects.toMatchObject({status:500});
    await store.refresh();
    oldUsers.resolve(response({users:usersFixture(1000)}));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(store.getSnapshot().data?.users).toHaveLength(20);
    expect(store.getSnapshot().data?.stats.totalUsers).toBe(20);
  });

});
