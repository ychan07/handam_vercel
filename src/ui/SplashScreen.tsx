import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Aurora from "@/components/Aurora";
import BlurText from "@/components/BlurText";
import ShinyText from "@/components/ShinyText";
import RotatingText from "@/components/RotatingText";

export type SplashAnimConfig = {
  minMs?: number;
  maxMs?: number;
  finishDelayMs?: number;
  exitMs?: number;
  exitFadeDurationS?: number;
  markDurationS?: number;
  blurTextDelayMs?: number;
  blurTextStepDurationS?: number;
  progressBarDurationS?: number;
  rotatingIntervalMs?: number;
  rotatingStaggerDurationS?: number;
  rotatingSpring?: { damping?: number; stiffness?: number };
  aurora?: { amplitude?: number; blend?: number; speed?: number };
  shinyTextSpeed?: number;
};

type SplashScreenProps = {
  onDone: () => void;
  splashConfig?: SplashAnimConfig;
};

/** 앞 문구만 순환 (react-bits RotatingText) */
const SPLASH_ROTATING_PHRASES = [
  "다른 글감",
  "오늘의 운세",
  "최근 마음 패턴",
  "일기 장",
  "따뜻한 문장",
  "한담",
];

const SPLASH_DEFAULTS: Required<
  Pick<
    SplashAnimConfig,
    | "minMs"
    | "maxMs"
    | "finishDelayMs"
    | "exitMs"
    | "exitFadeDurationS"
    | "markDurationS"
    | "blurTextDelayMs"
    | "blurTextStepDurationS"
    | "progressBarDurationS"
    | "rotatingIntervalMs"
    | "rotatingStaggerDurationS"
    | "shinyTextSpeed"
  >
> & {
  rotatingSpring: { damping: number; stiffness: number };
  aurora: { amplitude: number; blend: number; speed: number };
} = {
  minMs: 2200,
  maxMs: 4200,
  finishDelayMs: 280,
  exitMs: 520,
  exitFadeDurationS: 0.5,
  markDurationS: 0.7,
  blurTextDelayMs: 90,
  blurTextStepDurationS: 0.4,
  progressBarDurationS: 0.25,
  rotatingIntervalMs: 1800,
  rotatingStaggerDurationS: 0.025,
  rotatingSpring: { damping: 22, stiffness: 280 },
  aurora: { amplitude: 1.15, blend: 0.42, speed: 0.85 },
  shinyTextSpeed: 2.8,
};

export default function SplashScreen({ onDone, splashConfig }: SplashScreenProps) {
  const cfg = { ...SPLASH_DEFAULTS, ...splashConfig, aurora: { ...SPLASH_DEFAULTS.aurora, ...splashConfig?.aurora }, rotatingSpring: { ...SPLASH_DEFAULTS.rotatingSpring, ...splashConfig?.rotatingSpring } };
  const [phase, setPhase] = useState<"intro" | "exit" | "gone">("intro");
  const [progress, setProgress] = useState(0);
  const [titleDone, setTitleDone] = useState(false);

  const finish = useCallback(() => {
    setPhase("exit");
    window.setTimeout(() => {
      setPhase("gone");
      onDone();
    }, cfg.exitMs);
  }, [onDone, cfg.exitMs]);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / cfg.minMs);
      setProgress(Math.round(t * 92));
      if (titleDone && elapsed >= cfg.minMs) {
        setProgress(100);
        window.setTimeout(finish, cfg.finishDelayMs);
        return;
      }
      if (elapsed < cfg.maxMs) raf = requestAnimationFrame(tick);
      else {
        setProgress(100);
        finish();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [titleDone, finish, cfg.minMs, cfg.maxMs, cfg.finishDelayMs]);

  if (phase === "gone") return null;

  return (
    <AnimatePresence>
      {phase !== "gone" && (
        <motion.div
          className="splash-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: cfg.exitFadeDurationS, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="splash-aurora">
            <Aurora
              colorStops={["#E8A85C", "#C66A38", "#8B4A2E"]}
              amplitude={cfg.aurora.amplitude}
              blend={cfg.aurora.blend}
              speed={cfg.aurora.speed}
            />
          </div>
          <div className="splash-vignette" aria-hidden />
          <div className="splash-content">
            <motion.div
              className="splash-mark"
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: cfg.markDurationS, ease: [0.22, 1, 0.36, 1] }}
            >
              <i className="fa-solid fa-feather-pointed" />
            </motion.div>
            <div className="splash-title" role="heading" aria-level={1}>
              <BlurText
                text="한담"
                delay={cfg.blurTextDelayMs}
                animateBy="letters"
                direction="bottom"
                className="splash-blur-text"
                stepDuration={cfg.blurTextStepDurationS}
                threshold={0}
                onAnimationComplete={() => setTitleDone(true)}
              />
            </div>
            <p className="splash-tagline">
              <ShinyText
                text="마음을 담는 하루의 기록"
                speed={cfg.shinyTextSpeed}
                color="rgba(255,248,240,0.55)"
                shineColor="rgba(255,255,255,0.95)"
                spread={100}
                className="text-[15px] font-extrabold tracking-tight"
              />
            </p>
            <div className="splash-progress">
              <motion.div
                className="splash-progress-fill"
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: cfg.progressBarDurationS, ease: "easeOut" }}
              />
            </div>
            <div className="splash-rotating-wrap" aria-live="polite">
              <RotatingText
                texts={SPLASH_ROTATING_PHRASES}
                rotationInterval={cfg.rotatingIntervalMs}
                splitBy="characters"
                staggerDuration={cfg.rotatingStaggerDurationS}
                staggerFrom="first"
                transition={{ type: "spring", damping: cfg.rotatingSpring.damping, stiffness: cfg.rotatingSpring.stiffness }}
                initial={{ y: "100%", opacity: 0, rotateX: -80 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                exit={{ y: "-120%", opacity: 0, rotateX: 80 }}
                mainClassName="splash-rotating-text"
                elementLevelClassName="splash-rotating-char"
              />
              <span className="splash-rotating-suffix">준비중이에요</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
