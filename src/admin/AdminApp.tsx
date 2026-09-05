import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PersonIcon, ActivityLogIcon, EnvelopeClosedIcon, LockClosedIcon, ExitIcon, GearIcon, DownloadIcon, ReloadIcon, MagnifyingGlassIcon, ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, DrawingPinIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { ErrorNotice } from "./fields";
import { UserPanel, SettingsPanel } from "./Panels";
import { absoluteDate, paginate, relativeDate, selectUsers, userName, usersCsv } from "./model";
import type { AdminBridgeOptions, AdminSession, AdminUser, UserFilter, UserSort } from "./types";
import type { AdminStore } from "./store";

function Choice({ id, label, value, onChange, items }: { id: string; label: string; value: string; onChange: (value: string) => void; items: [string, string][] }) {
  return <div className="adm-choice"><Label htmlFor={id} className="sr-only">{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id} aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(([key, name]) => <SelectItem key={key} value={key}>{name}</SelectItem>)}</SelectGroup></SelectContent></Select></div>;
}
export default function AdminApp({ store, options }: { store: AdminStore; options: AdminBridgeOptions }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [session, setSession] = useState<AdminSession>(() => options.getSession()!);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [sort, setSort] = useState<UserSort>("created");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const origin = useRef<HTMLElement | null>(null);
  const header = useRef<HTMLHeadingElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const filtered = useMemo(() => selectUsers(snapshot.data?.users || [], query, filter, sort), [snapshot.data, query, filter, sort]);
  const paged = paginate(filtered, page, size);
  const selectedUser = snapshot.data?.users.find(user => user.uid === selected?.uid) || selected;
  useEffect(() => { void store.refresh().catch(() => {}); header.current?.focus(); }, [store]);
  useEffect(() => { if (page !== paged.page) setPage(paged.page); }, [page, paged.page]);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const refresh = () => { void store.refresh().catch(() => {}); };
  const reset = () => { setQuery(""); setFilter("all"); setPage(1); };
  const restoreFocus = () => { requestAnimationFrame(() => { if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); else document.getElementById("admin-search")?.focus({ preventScroll: true }); }); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([usersCsv(filtered)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `handam-users-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const stats = snapshot.data?.stats;
  const metrics = [
    { label: "전체 사용자", value: stats?.totalUsers, icon: PersonIcon, note: "함께하는 사용자" },
    { label: "최근 활동", value: stats?.activeUsers, icon: ActivityLogIcon, note: `최근 ${stats?.activeWindowMinutes ?? 15}분 기준` },
    { label: "이메일 보유", value: stats?.emailUsers, icon: EnvelopeClosedIcon, note: "이메일이 등록된 계정" },
    { label: "정지 계정", value: stats?.disabledUsers, icon: LockClosedIcon, note: "로그인이 제한된 계정" },
  ];
  return <>
    <main className="adm-workspace">
      <header className="adm-header"><div className="adm-brand"><span className="adm-brand-mark" aria-hidden="true"><DrawingPinIcon /></span><div><p className="adm-kicker">HANDAM · ADMIN</p><h1 ref={header} tabIndex={-1}>한담 관리자</h1></div></div><div className="adm-header-actions"><p className="adm-session"><span className="adm-status-dot" />{session.username}<span className="adm-session-suffix">님</span></p><Button variant="outline" onClick={event => { origin.current = event.currentTarget; setSettingsOpen(true); }}><GearIcon />계정 설정</Button><Button variant="ghost" onClick={() => options.onLogout()}><ExitIcon />로그아웃</Button></div></header>
      <section className="adm-overview" aria-labelledby="overview-title"><div className="adm-section-heading"><div><p className="adm-kicker">OVERVIEW</p><h2 id="overview-title">한담의 오늘을 한눈에</h2><p className="adm-intro">사용자의 활동을 살펴보고, 필요한 관리를 이어가세요.</p></div><p className="adm-updated" role="status">{snapshot.loading ? "최신 정보를 불러오는 중…" : snapshot.updatedAt ? `마지막 갱신 ${absoluteDate(snapshot.updatedAt)} KST` : "아직 갱신되지 않았어요"}</p></div>
        <div className="adm-metrics" aria-busy={snapshot.loading}>{metrics.map((metric, index) => <Card className="adm-metric" key={metric.label} data-highlight={index === 1}><CardHeader><CardDescription><metric.icon />{metric.label}</CardDescription></CardHeader><CardContent>{!snapshot.data && snapshot.loading ? <Skeleton className="h-10 w-20" /> : <p className="adm-number">{metric.value === undefined ? "—" : metric.value.toLocaleString("ko-KR")}<span>명</span></p>}</CardContent><CardFooter>{metric.note}</CardFooter></Card>)}</div>
        <p className="adm-activity-note">최근 활동은 {stats?.activeWindowMinutes ?? 15}분 이내 접속 또는 로그인을 기준으로 합니다. 접속 기록이 없으면 로그인 시각으로 대체합니다.</p>
      </section>
      {stats && (!stats.firebaseConfigured || !stats.firestoreEnabled) && <Alert><ActivityLogIcon /><AlertTitle>{!stats.firebaseConfigured ? "사용자 관리 서버가 연결되지 않았어요" : "접속 기록을 사용할 수 없어요"}</AlertTitle><AlertDescription>{!stats.firebaseConfigured ? "현재 사용자 수를 확인할 수 없습니다. 서버 연결 후 새로고침해주세요." : "최근 로그인 시각을 기준으로 활동 여부를 표시합니다."}</AlertDescription></Alert>}
      <ErrorNotice message={snapshot.error} title={snapshot.data ? "최신 정보를 불러오지 못했어요" : "사용자 정보를 불러오지 못했어요"}><p>{snapshot.data ? "이전에 불러온 정보와 갱신 시각을 유지하고 있어요." : "연결 상태를 확인하고 다시 시도해주세요."}</p><Button variant="outline" disabled={snapshot.loading} onClick={refresh}>다시 불러오기</Button></ErrorNotice>
      <section className="adm-users" aria-labelledby="users-title"><div className="adm-section-heading"><div className="adm-users-heading"><h2 id="users-title">사용자</h2>{snapshot.data && <Badge variant="secondary">{snapshot.data.users.length.toLocaleString("ko-KR")}명</Badge>}</div><span className="adm-caption">한 사람씩, 필요한 만큼 세심하게</span></div>
        <div className="adm-toolbar">
          <div className="adm-search-row"><div className="adm-search"><Label className="sr-only" htmlFor="admin-search">이름·이메일·UID 검색</Label><MagnifyingGlassIcon aria-hidden="true" /><Input id="admin-search" type="search" placeholder="이름·이메일·UID 검색" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><Button variant="outline" onClick={refresh} disabled={snapshot.loading} aria-label="목록과 통계 새로고침"><ReloadIcon className={snapshot.loading ? "adm-spin" : undefined} /><span className="adm-refresh-label">새로고침</span></Button><Button variant="outline" disabled={!filtered.length || snapshot.loading} onClick={download}><DownloadIcon />CSV {filtered.length.toLocaleString("ko-KR")}명</Button></div>
          <div className="adm-filter-row"><ToggleGroup type="single" value={filter} onValueChange={value => { if (value) { setFilter(value as UserFilter); setPage(1); } }} aria-label="사용자 상태 필터"><ToggleGroupItem value="all">전체</ToggleGroupItem><ToggleGroupItem value="active">최근 활동</ToggleGroupItem><ToggleGroupItem value="disabled">정지</ToggleGroupItem></ToggleGroup><Choice id="admin-sort" label="사용자 정렬" value={sort} onChange={value => { setSort(value as UserSort); setPage(1); }} items={[["created", "가입일 최신순"], ["activity", "최근 활동순"], ["name", "이름순"]]} /></div>
        </div>
        <div className="adm-list-info"><p role="status">{snapshot.data ? `검색 결과 ${filtered.length.toLocaleString("ko-KR")}명${filtered.length ? ` · ${(paged.page - 1) * size + 1}–${Math.min(paged.page * size, filtered.length)}명 표시` : ""}` : snapshot.loading ? "사용자를 불러오고 있어요" : "조회 결과 없음"}</p><Choice id="admin-size" label="페이지당 사용자 수" value={String(size)} onChange={value => { setSize(Number(value)); setPage(1); }} items={[["20", "20명씩"], ["50", "50명씩"], ["100", "100명씩"]]} /></div>
        {!snapshot.data && snapshot.loading ? <div className="adm-user-grid" aria-label="사용자 목록 로딩">{Array.from({ length: 6 }, (_, index) => <Card className="adm-user-skeleton" key={index}><Skeleton className="size-12 rounded-full" /><div className="flex flex-col gap-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" /><Skeleton className="h-4 w-24" /></div></Card>)}</div> : snapshot.data && !paged.users.length ? <Card className="adm-empty"><CardHeader><PersonIcon /><CardTitle>{!stats?.firebaseConfigured ? "서버 연결을 기다리고 있어요" : snapshot.data.users.length === 0 ? "아직 등록된 사용자가 없어요" : "검색 결과가 없어요"}</CardTitle><CardDescription>{snapshot.data.users.length === 0 ? "사용자가 가입하면 이곳에서 확인하고 관리할 수 있어요." : "다른 검색어를 입력하거나 필터를 초기화해보세요."}</CardDescription></CardHeader><CardFooter>{snapshot.data.users.length > 0 && <Button variant="outline" onClick={reset}>검색·필터 초기화</Button>}</CardFooter></Card> : <div className="adm-user-grid" aria-busy={snapshot.loading}>{paged.users.map(user => <Card className="adm-user" key={user.uid}><CardHeader><Avatar><AvatarFallback>{userName(user).slice(0, 1)}</AvatarFallback></Avatar><div className="adm-user-identity"><CardTitle>{userName(user)}</CardTitle><CardDescription>{user.email || "이메일 없음"}</CardDescription></div><Badge variant={user.disabled ? "destructive" : "secondary"}>{user.disabled ? "정지" : "정상"}</Badge></CardHeader><CardContent><span className="adm-user-activity" data-active={user.active}><span className="adm-status-dot" />{user.active ? "최근 활동" : "최근 활동 없음"}</span><span className="adm-relative">{relativeDate(user.lastSeen || user.lastSignIn, snapshot.updatedAt ? Date.parse(snapshot.updatedAt) : Date.now())}</span></CardContent><CardFooter><Button variant="ghost" className="w-full" aria-label={`${userName(user)} 상세 보기`} onClick={event => { origin.current = event.currentTarget; setSelected(user); }}>상세 보기<ArrowRightIcon /></Button></CardFooter></Card>)}</div>}
        {filtered.length > 0 && <Pagination aria-label="사용자 목록 페이지"><PaginationContent><PaginationItem><Button variant="outline" size="icon" aria-label="이전 페이지" disabled={paged.page === 1} onClick={() => setPage(paged.page - 1)}><ChevronLeftIcon /></Button></PaginationItem><PaginationItem><span className="adm-page-number" aria-live="polite">{paged.page} / {paged.pages} 페이지</span></PaginationItem><PaginationItem><Button variant="outline" size="icon" aria-label="다음 페이지" disabled={paged.page === paged.pages} onClick={() => setPage(paged.page + 1)}><ChevronRightIcon /></Button></PaginationItem></PaginationContent></Pagination>}
      </section>
      <footer className="adm-footer"><span>한담</span><p>마음을 기록하는 공간, 함께 돌보는 일상.</p></footer>
    </main>
    {selectedUser && <UserPanel key={selectedUser.uid} user={selectedUser} store={store} close={() => setSelected(null)} returnFocus={restoreFocus} refreshPending={snapshot.loading || !!snapshot.error} />}
    {settingsOpen && <SettingsPanel session={session} store={store} close={() => setSettingsOpen(false)} returnFocus={restoreFocus} onSave={next => { options.onSessionChange(next); setSession(next); }} />}
    <Toaster theme={theme} position="top-center" closeButton />
  </>;
}
