import { initAdminBridge } from "./admin/bridge";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./ui/splash.css";
import SplashScreen from "./ui/SplashScreen";
import { loadAnimations } from "../animations.js";
import { initFortuneLoadingBridge } from "./fortune-loading-bridge";

function revealApp(revealDelayMs = 600) {
  const device = document.querySelector(".device");
  const splashRoot = document.getElementById("splash-root");
  device?.classList.remove("app-shell--loading");
  document.body.classList.remove("is-splash-active");
  window.setTimeout(() => splashRoot?.remove(), revealDelayMs);
  window.dispatchEvent(new CustomEvent("handam:splash-done"));
}

async function bootSplash() {
  const cfg = await loadAnimations();
  initFortuneLoadingBridge(cfg);
  const splash = cfg.loading?.splash ?? {};
  const revealDelayMs = splash.revealAppDelayMs ?? 600;

  const mount = document.getElementById("splash-root");
  if (mount) {
    document.body.classList.add("is-splash-active");
    createRoot(mount).render(
      <SplashScreen
        splashConfig={splash}
        onDone={() => revealApp(revealDelayMs)}
      />
    );
  } else {
    revealApp(revealDelayMs);
  }
}

initAdminBridge();
bootSplash();
