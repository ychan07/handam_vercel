import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Aurora from "@/components/Aurora";
import BlurText from "@/components/BlurText";
import ShinyText from "@/components/ShinyText";

type SplashScreenProps = {
  onDone: () => void;
};

export default function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<"intro" | "exit" | "gone">("intro");
  const [progress, setProgress] = useState(0);
  const [titleDone, setTitleDone] = useState(false);

  const finish = useCallback(() => {
    setPhase("exit");
    window.setTimeout(() => {
      setPhase("gone");
      onDone();
    }, 520);
  }, [onDone]);

  useEffect(() => {
    const start = performance.now();
    const minMs = 2200;
    const maxMs = 4200;
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / minMs);
      setProgress(Math.round(t * 92));
      if (titleDone && elapsed >= minMs) {
        setProgress(100);
        window.setTimeout(finish, 280);
        return;
      }
      if (elapsed < maxMs) raf = requestAnimationFrame(tick);
      else {
        setProgress(100);
        finish();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [titleDone, finish]);

  if (phase === "gone") return null;

  return (
    <AnimatePresence>
      {phase !== "gone" && (
        <motion.div
          className="splash-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="splash-aurora">
            <Aurora
              colorStops={["#E8A85C", "#C66A38", "#8B4A2E"]}
              amplitude={1.15}
              blend={0.42}
              speed={0.85}
            />
          </div>
          <div className="splash-vignette" aria-hidden />
          <div className="splash-content">
            <motion.div
              className="splash-mark"
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <i className="fa-solid fa-feather-pointed" />
            </motion.div>
            <div className="splash-title" role="heading" aria-level={1}>
              <BlurText
                text="한담"
                delay={90}
                animateBy="letters"
                direction="bottom"
                className="splash-blur-text"
                stepDuration={0.4}
                threshold={0}
                onAnimationComplete={() => setTitleDone(true)}
              />
            </div>
            <p className="splash-tagline">
              <ShinyText
                text="마음을 담는 하루의 기록"
                speed={2.8}
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
                transition={{ duration: 0.25, ease: "easeOut" }}
              />
            </div>
            <p className="splash-hint">잠시만 기다려 주세요</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
