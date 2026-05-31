import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Aurora from "@/components/Aurora";
import BlurText from "@/components/BlurText";
import ShinyText from "@/components/ShinyText";
import RotatingText from "@/components/RotatingText";

export type FortuneLoadingAnimConfig = {
  minMs?: number;
  maxMs?: number;
  finishDelayMs?: number;
  exitMs?: number;
  exitFadeDurationS?: number;
  symbolDurationS?: number;
  symbolPulseDurationS?: number;
  blurTextDelayMs?: number;
  blurTextStepDurationS?: number;
  progressBarDurationS?: number;
  rotatingIntervalMs?: number;
  rotatingStaggerDurationS?: number;
  rotatingSpring?: { damping?: number; stiffness?: number };
  aurora?: { amplitude?: number; blend?: number; speed?: number };
  shinyTextSpeed?: number;
};

type FortuneLoadingScreenProps = {
  westernZodiac: string;
  chineseZodiac: string;
  onDone: () => void;
  loadingConfig?: FortuneLoadingAnimConfig;
};

const ZODIAC_SYMBOL: Record<string, string> = {
  양자리: "♈",
  황소자리: "♉",
  쌍둥이자리: "♊",
  게자리: "♋",
  사자자리: "♌",
  처녀자리: "♍",
  천칭자리: "♎",
  전갈자리: "♏",
  사수자리: "♐",
  염소자리: "♑",
  물병자리: "♒",
  물고기자리: "♓",
};

const FORTUNE_ROTATING_PHRASES = [
  "별자리의 기운",
  "오늘의 운세",
  "행운의 색",
  "분야별 조언",
  "띠의 기운",
];

const FORTUNE_DEFAULTS: Required<
  Pick<
    FortuneLoadingAnimConfig,
    | "minMs"
    | "maxMs"
    | "finishDelayMs"
    | "exitMs"
    | "exitFadeDurationS"
    | "symbolDurationS"
    | "symbolPulseDurationS"
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
  minMs: 2800,
  maxMs: 4500,
  finishDelayMs: 300,
  exitMs: 520,
  exitFadeDurationS: 0.45,
  symbolDurationS: 0.85,
  symbolPulseDurationS: 2.4,
  blurTextDelayMs: 70,
  blurTextStepDurationS: 0.38,
  progressBarDurationS: 0.25,
  rotatingIntervalMs: 1600,
  rotatingStaggerDurationS: 0.025,
  rotatingSpring: { damping: 24, stiffness: 300 },
  aurora: { amplitude: 1.05, blend: 0.38, speed: 0.9 },
  shinyTextSpeed: 3.2,
};

export default function FortuneLoadingScreen({
  westernZodiac,
  chineseZodiac,
  onDone,
  loadingConfig,
}: FortuneLoadingScreenProps) {
  const cfg = {
    ...FORTUNE_DEFAULTS,
    ...loadingConfig,
    aurora: { ...FORTUNE_DEFAULTS.aurora, ...loadingConfig?.aurora },
    rotatingSpring: { ...FORTUNE_DEFAULTS.rotatingSpring, ...loadingConfig?.rotatingSpring },
  };
  const [phase, setPhase] = useState<"intro" | "exit" | "gone">("intro");
  const [progress, setProgress] = useState(0);
  const [titleDone, setTitleDone] = useState(false);
  const symbol = ZODIAC_SYMBOL[westernZodiac] ?? "✦";

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
          className="fortune-loading-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: cfg.exitFadeDurationS, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label="운세 계산 중"
        >
          <div className="fortune-loading-aurora">
            <Aurora
              colorStops={["#F0B96A", "#D47A42", "#7A3C28"]}
              amplitude={cfg.aurora.amplitude}
              blend={cfg.aurora.blend}
              speed={cfg.aurora.speed}
            />
          </div>
          <div className="fortune-loading-vignette" aria-hidden />
          <div className="fortune-loading-content">
            <motion.div
              className="fortune-loading-symbol"
              initial={{ scale: 0.5, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: cfg.symbolDurationS, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className="fortune-loading-glyph"
                aria-hidden
                style={{ animationDuration: `${cfg.symbolPulseDurationS}s` }}
              >
                {symbol}
              </span>
            </motion.div>
            <div className="fortune-loading-title" role="heading" aria-level={2}>
              <BlurText
                text={westernZodiac}
                delay={cfg.blurTextDelayMs}
                animateBy="letters"
                direction="bottom"
                className="fortune-loading-blur-text"
                stepDuration={cfg.blurTextStepDurationS}
                threshold={0}
                onAnimationComplete={() => setTitleDone(true)}
              />
            </div>
            <p className="fortune-loading-tagline">
              <ShinyText
                text={`${chineseZodiac} · 오늘의 운세를 읽는 중`}
                speed={cfg.shinyTextSpeed}
                color="rgba(255,248,240,0.55)"
                shineColor="rgba(255,255,255,0.95)"
                spread={100}
                className="text-[14px] font-extrabold tracking-tight"
              />
            </p>
            <div className="fortune-loading-progress">
              <motion.div
                className="fortune-loading-progress-fill"
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: cfg.progressBarDurationS, ease: "easeOut" }}
              />
            </div>
            <div className="fortune-loading-rotating-wrap" aria-live="polite">
              <RotatingText
                texts={FORTUNE_ROTATING_PHRASES}
                rotationInterval={cfg.rotatingIntervalMs}
                splitBy="characters"
                staggerDuration={cfg.rotatingStaggerDurationS}
                staggerFrom="first"
                transition={{
                  type: "spring",
                  damping: cfg.rotatingSpring.damping,
                  stiffness: cfg.rotatingSpring.stiffness,
                }}
                initial={{ y: "100%", opacity: 0, rotateX: -80 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                exit={{ y: "-120%", opacity: 0, rotateX: 80 }}
                mainClassName="fortune-loading-rotating-text"
                elementLevelClassName="fortune-loading-rotating-char"
              />
              <span className="fortune-loading-rotating-suffix">맞추는 중이에요</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
