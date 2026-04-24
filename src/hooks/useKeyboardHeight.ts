import { useState, useEffect } from "react";

/**
 * Tracks the mobile virtual keyboard height using the Visual Viewport API.
 * Returns the keyboard height in pixels (0 when keyboard is closed).
 *
 * Works by comparing `window.innerHeight` (the layout viewport, which stays
 * fixed when body is `position: fixed`) against
 * `window.visualViewport.height` (which shrinks when the keyboard opens).
 */
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // On iOS/Android, when the keyboard opens the visual viewport shrinks
      // but innerHeight stays the same because body is position:fixed.
      const diff = Math.max(0, window.innerHeight - vv.height);
      // Small threshold to avoid jitter from address-bar resize
      setKeyboardHeight(diff > 40 ? diff : 0);
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return keyboardHeight;
}
