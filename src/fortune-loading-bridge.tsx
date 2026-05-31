import { createRoot, type Root } from "react-dom/client";
import FortuneLoadingScreen from "./ui/FortuneLoadingScreen";
import "./ui/fortune-loading.css";

export type FortuneLoadingShowOptions = {
  westernZodiac: string;
  chineseZodiac: string;
  onDone: () => void;
};

type AnimConfig = {
  loading?: {
    fortune?: Record<string, unknown>;
  };
};

let fortuneRoot: Root | null = null;
let animConfig: AnimConfig | null = null;

function teardownFortuneMount(mount: HTMLElement) {
  document.body.classList.remove("is-fortune-loading-active");
  fortuneRoot?.unmount();
  fortuneRoot = null;
  mount.replaceChildren();
}

export function initFortuneLoadingBridge(cfg: AnimConfig) {
  animConfig = cfg;

  window.handamFortuneLoading = {
    show({ westernZodiac, chineseZodiac, onDone }) {
      const mount = document.getElementById("fortune-loading-root");
      if (!mount) {
        onDone();
        return;
      }

      teardownFortuneMount(mount);
      document.body.classList.add("is-fortune-loading-active");
      fortuneRoot = createRoot(mount);
      fortuneRoot.render(
        <FortuneLoadingScreen
          westernZodiac={westernZodiac}
          chineseZodiac={chineseZodiac}
          loadingConfig={animConfig?.loading?.fortune}
          onDone={() => {
            teardownFortuneMount(mount);
            onDone();
          }}
        />
      );
    },
  };
}

declare global {
  interface Window {
    handamFortuneLoading?: {
      show: (opts: FortuneLoadingShowOptions) => void;
    };
  }
}
