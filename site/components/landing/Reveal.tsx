'use client';

import { motion, useReducedMotion, useScroll, useTransform, type Variants } from 'motion/react';
import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

// Kept numerically in sync with --rialto-ease in landing.css — one curve
// for every hover/reveal transition on the landing page.
const EASE = [0.16, 0.84, 0.44, 1] as const;

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
};

const viewport = { once: true, margin: '0px 0px 12% 0px' };

/** Fades + rises a single block into view the first time it scrolls into the viewport. */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
      variants={itemVariants}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/** Wraps a grid/stack of children, staggering each direct child's Reveal-style entrance. */
export function Stagger({
  children,
  className,
  style,
  staggerDelay = 0.08,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  staggerDelay?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
      variants={{ visible: { transition: { staggerChildren: staggerDelay } } }}
    >
      {children}
    </motion.div>
  );
}

/** Direct child of <Stagger> — do not use standalone. */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/**
 * Translates children vertically as the page scrolls past their container,
 * so decorative layers drift at different rates instead of moving 1:1 with
 * scroll. `speed` is roughly the total travel in em-like units — positive
 * values drift down slower than the page, negative values counter-scroll.
 */
export function Parallax({
  children,
  speed = 40,
  className,
  style,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [-speed, speed]);

  if (reduceMotion) {
    return (
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={className} style={{ ...style, y }}>
      {children}
    </motion.div>
  );
}

/**
 * Wraps a card so it tilts toward the cursor on hover (perspective
 * rotateX/rotateY, like the hero crystal's camera-follow but driven by CSS
 * transform on a plain element instead of a 3D scene). Applies the class's
 * existing hover lift itself (baked into the same transform string) since an
 * inline `style.transform` always wins over a CSS `:hover { transform }`
 * rule — the lift would otherwise silently stop working once this wraps it.
 */
export function TiltCard({
  children,
  className,
  style,
  maxTilt = 7,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  maxTilt?: number;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `translateY(-3px) perspective(700px) rotateX(${(-ny * maxTilt).toFixed(2)}deg) rotateY(${(nx * maxTilt).toFixed(2)}deg)`;
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (el) el.style.transform = '';
  }

  return (
    <div ref={ref} className={className} style={style} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      {children}
    </div>
  );
}

/**
 * Line-mask reveal for headings: clips to one line and slides the text up
 * into view (vs. Reveal's fade+rise) — for plain-text headings only, since
 * the mask clips overflow.
 */
export function RevealMask({
  children,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div className={className} style={{ overflow: 'hidden', ...style }}>
      <motion.div
        initial={{ y: '100%' }}
        whileInView={{ y: '0%' }}
        viewport={viewport}
        transition={{ duration: 0.7, ease: EASE, delay }}
      >
        {children}
      </motion.div>
    </div>
  );
}
