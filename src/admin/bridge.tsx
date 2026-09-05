import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import AdminApp from "./AdminApp";
import { AdminStore } from "./store";
import type { AdminBridgeOptions } from "./types";
import { PortalContainerContext } from "@/components/ui/portal-container";

let root: Root | null = null;
let store: AdminStore | null = null;
let teardownViewport: (() => void) | null = null;
function unmount() {
  window.handamAdminPending = undefined;
  store?.dispose(); store = null;
  root?.unmount(); root = null;
  toast.dismiss();
  teardownViewport?.(); teardownViewport = null;
  document.body.classList.remove("is-admin-active");
  const host = document.getElementById("admin-root");
  if (host) host.hidden = true;
}
function mount(options: AdminBridgeOptions) {
  if (!options.getSession()) return;
  if (root) return;
  const host = document.getElementById("admin-root");
  const app = document.getElementById("admin-app");
  const portals = document.getElementById("admin-portals");
  if (!host || !app || !portals) return;
  host.hidden = false; document.body.classList.add("is-admin-active");
  const viewport = window.visualViewport;
  const resize = () => {
    host.style.setProperty("--admin-vh", `${viewport?.height || window.innerHeight}px`);
    host.style.setProperty("--admin-vtop", `${viewport?.offsetTop || 0}px`);
  };
  resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize); window.addEventListener("resize", resize);
  teardownViewport = () => { viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); window.removeEventListener("resize", resize); };
  const wrapped: AdminBridgeOptions = { ...options, onLogout: message => {
    // React may be handling an event: defer root disposal until that event finishes.
    store?.dispose(); queueMicrotask(() => { unmount(); options.onLogout(message); });
  } };
  store = new AdminStore(wrapped); root = createRoot(app);
  root.render(<PortalContainerContext.Provider value={portals}><AdminApp store={store} options={wrapped} /></PortalContainerContext.Provider>);
}
export function initAdminBridge() {
  window.handamAdmin = { mount, unmount };
  const pending = window.handamAdminPending;
  window.handamAdminPending = undefined;
  if (pending) mount(pending);
}
declare global {
  interface Window {
    handamAdmin?: { mount: typeof mount; unmount: typeof unmount };
    handamAdminPending?: AdminBridgeOptions;
  }
}
