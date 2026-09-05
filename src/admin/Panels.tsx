import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ReloadIcon, Link2Icon, LockClosedIcon, TrashIcon, PersonIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { ErrorNotice, FormField } from "./fields";
import { absoluteDate, passwordErrors, userName } from "./model";
import type { AdminSession, AdminUser } from "./types";
import type { AdminStore } from "./store";

type PanelProps = { store: AdminStore; close: () => void; returnFocus: () => void };
type ConfirmAction = "toggle" | "delete";
const messageOf = (error: unknown) => error instanceof Error ? error.message : "작업을 처리하지 못했어요.";
export function UserPanel({ user, store, close, returnFocus, refreshPending }: PanelProps & { user: AdminUser; refreshPending: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState({ password: "", confirmation: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const busy = useRef(false);
  const mounted = useRef(true);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const confirmTrigger = useRef<HTMLElement | null>(null);
  const [link, setLink] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const cleanup = () => { mounted.current = false; setPassword(""); setConfirmation(""); setLink(""); close(); };
  const copyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      if (!store.alive || !mounted.current) return;
      setCopyFailed(false); toast.success("재설정 링크를 복사했어요.");
    } catch { if (store.alive && mounted.current) setCopyFailed(true); }
  };
  const run = async (action: string, payload: Record<string, unknown>, success: string, sync = false) => {
    if (busy.current || refreshPending) return;
    busy.current = true; setPending(action); setError("");
    try {
      const result = await store.mutate<{ link?: string }>(user.uid, action, payload);
      if (!store.alive || !mounted.current) return;
      if (action === "reset-password") { setPassword(""); setConfirmation(""); }
      if (result.link) { setLink(result.link); await copyLink(result.link); }
      else toast.success(success);
      setConfirmAction(null);
      if (sync) {
        try { await store.refresh(); }
        catch {
          if (store.alive && mounted.current) setError("작업 완료, 최신 정보 확인 필요. 목록과 통계를 다시 불러와주세요.");
          return;
        }
      }
      if (action === "delete-user" && store.alive) cleanup();
    } catch (cause) { if (store.alive && mounted.current) setError(messageOf(cause)); }
    finally { busy.current = false; if (store.alive && mounted.current) setPending(""); }
  };
  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = passwordErrors(password, confirmation, 6); setErrors(next);
    if (next.password || next.confirmation) {
      document.getElementById(next.password ? "user-password" : "user-confirm")?.focus(); return;
    }
    void run("reset-password", { uid: user.uid, newPassword: password }, "사용자 비밀번호를 초기화했어요.");
  };
  const ask = (action: ConfirmAction, trigger: HTMLElement) => { confirmTrigger.current = trigger; setError(""); setConfirmAction(action); };
  const locked = !!pending || refreshPending;
  return <Sheet open onOpenChange={open => { if (!open && !busy.current) cleanup(); }}>
    <SheetContent className="adm-sheet" onCloseAutoFocus={event => { event.preventDefault(); returnFocus(); }} onEscapeKeyDown={event => { if (busy.current) event.preventDefault(); }}>
      <SheetHeader><div className="adm-kicker">사용자 관리</div><SheetTitle>사용자 상세</SheetTitle><SheetDescription>계정 정보와 최근 활동을 확인하고 관리하세요.</SheetDescription></SheetHeader>
      <div className="adm-panel-body">
        <div className="adm-profile"><div className="adm-profile-icon"><PersonIcon /></div><h3>{userName(user)}</h3><p>{user.email || "이메일 없음"}</p><Badge variant={user.disabled ? "destructive" : "secondary"}>{user.disabled ? "정지 계정" : "사용 가능"}</Badge></div>
        <section className="adm-section"><h3>기본 정보</h3><dl className="adm-details"><dt>사용자 UID</dt><dd>{user.uid}</dd><dt>이메일</dt><dd>{user.email || "기록 없음"}</dd><dt>전화번호</dt><dd>{user.phone || "기록 없음"}</dd><dt>로그인 방식</dt><dd>{user.providers.join(" · ") || "기록 없음"}</dd></dl></section>
        <Separator />
        <section className="adm-section"><h3>활동 정보 <span>한국 시간 · KST</span></h3><dl className="adm-details"><dt>가입</dt><dd>{absoluteDate(user.createdAt)}</dd><dt>최근 로그인</dt><dd>{absoluteDate(user.lastSignIn)}</dd><dt>최근 활동</dt><dd>{absoluteDate(user.lastSeen || user.lastSignIn)}</dd></dl><p className="adm-help">{user.active ? "최근 활동이 확인된 사용자예요." : "최근 활동 기록이 없어요."} 접속 기록이 없으면 최근 로그인 시각을 사용합니다.</p></section>
        <Separator />
        <section className="adm-section" aria-busy={!!pending}><h3>계정 작업</h3>
          <ErrorNotice message={error} title={error.startsWith("작업 완료") ? "작업 완료, 최신 정보 확인 필요" : "작업을 확인해주세요"} />
          {user.email ? <>
            <form onSubmit={submitPassword} noValidate className="adm-form">
              <fieldset disabled={locked}><legend>비밀번호 초기화</legend><p className="adm-help">6자 이상 입력해주세요. 새 비밀번호는 사용자에게 직접 전달해주세요.</p>
                <FormField id="user-password" label="새 비밀번호" secret autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} error={errors.password} />
                <FormField id="user-confirm" label="새 비밀번호 확인" secret autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} error={errors.confirmation} />
                <Button type="submit" variant="outline">{pending === "reset-password" ? <ReloadIcon className="adm-spin" /> : <LockClosedIcon />} {pending === "reset-password" ? "초기화 중…" : "비밀번호 초기화"}</Button>
              </fieldset>
            </form>
            <div className="adm-link-section"><Button variant="outline" disabled={locked} onClick={() => void run("reset-link", { email: user.email }, "")}>{pending === "reset-link" ? <ReloadIcon className="adm-spin" /> : <Link2Icon />} 링크 생성·복사</Button><p className="adm-help">비밀번호 재설정 링크를 생성합니다. 이메일을 자동 발송하지 않습니다.</p>
              {link && copyFailed && <div className="adm-field" role="status"><Label htmlFor="reset-link">복사하지 못했어요. 링크를 선택해 복사해주세요.</Label><Input id="reset-link" readOnly value={link} onFocus={e => e.currentTarget.select()} /><Button variant="outline" disabled={locked} onClick={() => void copyLink(link)}>복사 다시 시도</Button></div>}
            </div>
          </> : <p className="adm-help">이메일이 없는 계정은 비밀번호 초기화와 재설정 링크를 사용할 수 없어요.</p>}
          <Separator />
          <div className="adm-danger-actions"><Button variant="outline" disabled={locked} onClick={e => ask("toggle", e.currentTarget)}>{user.disabled ? "계정 정지 해제" : "계정 정지"}</Button><Button variant="destructive" disabled={locked} onClick={e => ask("delete", e.currentTarget)}><TrashIcon /> 계정 삭제</Button></div>
        </section>
      </div>
      <AlertDialog open={!!confirmAction} onOpenChange={open => { if (!open && !busy.current) { setConfirmAction(null); setError(""); } }}>
        <AlertDialogContent className="adm-confirm" onCloseAutoFocus={event => { event.preventDefault(); confirmTrigger.current?.focus(); }}>
          <AlertDialogHeader><AlertDialogTitle>{confirmAction === "delete" ? "이 계정을 삭제할까요?" : user.disabled ? "계정 정지를 해제할까요?" : "이 계정을 정지할까요?"}</AlertDialogTitle><AlertDialogDescription asChild><div><strong>{userName(user)}</strong><p className="adm-break">{user.email || "이메일 없음"}</p><p className="adm-confirm-copy">{confirmAction === "delete" ? "로그인 계정이 삭제되며 되돌릴 수 없습니다. 저장된 프로필·일기·접속 기록은 이 작업으로 삭제되지 않습니다." : user.disabled ? "이 사용자가 다시 로그인할 수 있도록 계정 정지를 해제합니다." : "이 사용자의 로그인을 제한합니다. 필요할 때 정지를 해제할 수 있습니다."}</p></div></AlertDialogDescription></AlertDialogHeader>
          <ErrorNotice message={error} />
          <AlertDialogFooter><AlertDialogCancel disabled={!!pending}>취소</AlertDialogCancel><Button variant={confirmAction === "delete" ? "destructive" : "default"} disabled={!!pending} onClick={() => void run(confirmAction === "delete" ? "delete-user" : "toggle-user", { uid: user.uid, ...(confirmAction === "toggle" ? { disabled: !user.disabled } : {}) }, confirmAction === "delete" ? "로그인 계정을 삭제했어요." : "계정 상태를 변경했어요.", true)}>{pending ? <><ReloadIcon className="adm-spin" /> 처리 중…</> : confirmAction === "delete" ? "계정 삭제 확인" : user.disabled ? "정지 해제 확인" : "계정 정지 확인"}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  </Sheet>;
}

export function SettingsPanel({ session, store, close, returnFocus, onSave }: PanelProps & { session: AdminSession; onSave: (session: AdminSession) => void }) {
  const [currentPassword, setCurrent] = useState("");
  const [username, setUsername] = useState(session.username);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const changed = username.trim() !== session.username || password.length > 0;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy.current || !changed) return;
    const next: Record<string, string> = { current: currentPassword ? "" : "현재 비밀번호를 입력해주세요.", username: username.trim() ? "" : "아이디를 입력해주세요.", ...(password || confirmation ? passwordErrors(password, confirmation, 4) : {}) };
    setErrors(next); setError("");
    const first = Object.keys(next).find(key => next[key]);
    if (first) { document.getElementById(`settings-${first}`)?.focus(); return; }
    if (username.trim() === session.username && password === currentPassword) { setError("변경된 내용이 없어요."); return; }
    busy.current = true; setPending(true);
    try {
      const nextSession = await store.mutate<AdminSession>("admin-settings", "credentials", { currentPassword, newUsername: username.trim(), ...(password ? { newPassword: password } : {}) });
      if (!store.alive) return;
      onSave(nextSession); setCurrent(""); setPassword(""); setConfirmation(""); toast.success("관리자 계정을 변경했어요.");
    } catch (cause) {
      if (store.alive) {
        const message = messageOf(cause); setError(message);
        if (/현재.*비밀번호/.test(message)) { setErrors(prev => ({ ...prev, current: message })); document.getElementById("settings-current")?.focus(); }
      }
    } finally { busy.current = false; if (store.alive) setPending(false); }
  };
  return <Sheet open onOpenChange={open => { if (!open && !busy.current) close(); }}><SheetContent className="adm-sheet" onCloseAutoFocus={event => { event.preventDefault(); returnFocus(); }}>
    <SheetHeader><div className="adm-kicker">관리자 계정</div><SheetTitle>계정 설정</SheetTitle><SheetDescription>변경 후에는 새 아이디와 비밀번호로 로그인하세요.</SheetDescription></SheetHeader>
    <div className="adm-panel-body"><form className="adm-form" noValidate onSubmit={submit} aria-busy={pending}><ErrorNotice message={error} /><fieldset disabled={pending}><legend className="sr-only">관리자 로그인 정보 변경</legend>
      <FormField id="settings-current" label="현재 비밀번호" secret autoComplete="current-password" value={currentPassword} onChange={e => setCurrent(e.target.value)} error={errors.current} />
      <Separator />
      <FormField id="settings-username" label="새 아이디" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} error={errors.username} />
      <FormField id="settings-password" label="새 비밀번호" secret autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} error={errors.password} />
      <p className="adm-help">변경할 때만 4자 이상 입력해주세요. 공백도 비밀번호에 포함됩니다.</p>
      <FormField id="settings-confirmation" label="새 비밀번호 확인" secret autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} error={errors.confirmation} />
      <Button type="submit" disabled={!changed || pending}>{pending && <ReloadIcon className="adm-spin" />}{pending ? "저장 중…" : "변경 사항 저장"}</Button>
    </fieldset></form></div>
  </SheetContent></Sheet>;
}
