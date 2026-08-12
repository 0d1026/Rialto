'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';

const EASE = [0.34, 1.1, 0.64, 1] as const;

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const viewport = { once: true, margin: '0px 0px -10% 0px' };

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
