import { useRef, useEffect, useCallback, useState } from "react";

const BOTTOM_THRESHOLD_PX = 50;

/**
 * Smart scroll hook that prevents streaming text layout thrashing.
 * Uses a ref for isAtBottom to avoid re-render cycles during auto-scroll.
 * Only auto-scrolls when follow mode is enabled (via settings + runtime state).
 */
export function useSmartScroll<T>(
  isGenerating: boolean,
  streamingDeps: T,
  autoFollowEnabled = true,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [isFollowing, setIsFollowing] = useState(true);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceToBottom < BOTTOM_THRESHOLD_PX;
    isAtBottomRef.current = atBottom;

    // If user scrolls away from bottom during generation, disable follow
    if (isGenerating && !atBottom) {
      setIsFollowing(false);
    }
    // If user manually scrolls back to bottom, re-enable follow
    if (atBottom) {
      setIsFollowing(true);
    }
  }, [isGenerating]);

  // Re-enable follow when a new generation starts (only if setting is on)
  useEffect(() => {
    if (isGenerating && autoFollowEnabled) {
      setIsFollowing(true);
      isAtBottomRef.current = true;
    }
  }, [isGenerating, autoFollowEnabled]);

  // The effective follow state: setting must be on AND runtime follow must be active
  const effectiveFollow = autoFollowEnabled && isFollowing;

  // Only show the "Follow/Bottom" button when auto-follow is enabled AND user has scrolled away.
  // When auto-follow is disabled, the button should never appear.
  const showFollowButton = autoFollowEnabled && !isFollowing;

  useEffect(() => {
    if (!isGenerating || !effectiveFollow || !containerRef.current) return;

    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [streamingDeps, isGenerating, effectiveFollow]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      isAtBottomRef.current = true;
      setIsFollowing(true);
    }
  }, []);

  return { containerRef, handleScroll, isFollowing: effectiveFollow, showFollowButton, scrollToBottom };
}
