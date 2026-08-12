'use client';

import { useEffect } from 'react';

/**
 * Turns on native smooth scrolling (anchor jumps, scrollIntoView) only while
 * the landing page is mounted, restoring the previous value on unmount so it
 * never leaks into /docs. Renders nothing.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'smooth';
    return () => {
      root.style.scrollBehavior = previous;
    };
  }, []);

  return null;
}
