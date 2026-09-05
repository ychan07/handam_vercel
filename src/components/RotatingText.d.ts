import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { HTMLMotionProps, TargetAndTransition, Transition } from "motion/react";
export interface RotatingTextHandle { next: () => void; previous: () => void; jumpTo: (index: number) => void; reset: () => void }
export interface RotatingTextProps extends Omit<HTMLMotionProps<"span">, "children" | "initial" | "animate" | "exit"> {
  texts: string[];
  transition?: Transition;
  initial?: TargetAndTransition;
  animate?: TargetAndTransition;
  exit?: TargetAndTransition;
  animatePresenceMode?: "wait" | "sync" | "popLayout";
  animatePresenceInitial?: boolean;
  rotationInterval?: number;
  staggerDuration?: number;
  staggerFrom?: "first" | "last" | "center" | "random" | number;
  loop?: boolean;
  auto?: boolean;
  splitBy?: string;
  onNext?: (index: number) => void;
  mainClassName?: string;
  splitLevelClassName?: string;
  elementLevelClassName?: string;
}
declare const RotatingText: ForwardRefExoticComponent<RotatingTextProps & RefAttributes<RotatingTextHandle>>;
export default RotatingText;
