import { createRoot } from "react-dom/client";
import "./index.css";
import "./ui/splash.css";
import SplashScreen from "./ui/SplashScreen";

function revealApp() {
  const device = document.querySelector(".device");
  const splashRoot = document.getElementById("splash-root");
  device?.classList.remove("app-shell--loading");
  document.body.classList.remove("is-splash-active");
  window.setTimeout(() => splashRoot?.remove(), 600);
  window.dispatchEvent(new CustomEvent("handam:splash-done"));
}

const mount = document.getElementById("splash-root");
if (mount) {
  document.body.classList.add("is-splash-active");
  createRoot(mount).render(<SplashScreen onDone={revealApp} />);
} else {
  revealApp();
}
