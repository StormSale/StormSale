import { useEffect, useRef, useCallback } from "react";

export interface UseFocusTrapOptions {
  isOpen: boolean;
  onClose?: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocus?: boolean;
}

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Custom hook implementing strict WCAG 2.1 AA focus trapping and keyboard navigation:
 * 1. Automatically moves focus to first focusable element when opened.
 * 2. Traps Tab and Shift+Tab key navigation strictly within the modal container.
 * 3. Dismisses modal on Escape key press.
 * 4. Restores focus to the triggering element upon closing.
 * 5. Dynamically assigns role="dialog", aria-modal="true", and aria-labelledby.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  initialFocusRef,
  returnFocus = true,
}: UseFocusTrapOptions) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Capture active element before opening
  useEffect(() => {
    if (isOpen) {
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        previouslyFocusedElementRef.current = document.activeElement;
      }
    }
  }, [isOpen]);

  // Initial focus management & accessibility attributes
  useEffect(() => {
    if (!isOpen) return;

    if (containerRef.current) {
      const el = containerRef.current;
      if (!el.getAttribute("role")) {
        el.setAttribute("role", "dialog");
      }
      if (!el.getAttribute("aria-modal")) {
        el.setAttribute("aria-modal", "true");
      }

      const heading = el.querySelector("h1, h2, h3, [data-dialog-title]");
      if (heading) {
        if (!heading.id) {
          heading.id = "dialog-title-" + Math.random().toString(36).substring(2, 9);
        }
        if (!el.getAttribute("aria-labelledby")) {
          el.setAttribute("aria-labelledby", heading.id);
        }
      }
    }

    const frameId = requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }

      if (containerRef.current) {
        const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        const visibleElements = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
        );

        if (visibleElements.length > 0) {
          visibleElements[0].focus();
        } else {
          if (!containerRef.current.hasAttribute("tabIndex")) {
            containerRef.current.setAttribute("tabIndex", "-1");
          }
          containerRef.current.focus();
        }
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [isOpen, initialFocusRef]);

  // Keyboard navigation: Escape key dismiss and Tab cycling
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !containerRef.current) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }

      if (e.key === "Tab") {
        const focusableElements = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter(
          (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const currentActive = document.activeElement;

        if (e.shiftKey) {
          // Shift + Tab: reverse cycling
          if (currentActive === firstElement || !containerRef.current.contains(currentActive)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: forward cycling
          if (currentActive === lastElement || !containerRef.current.contains(currentActive)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, handleKeyDown]);

  // Focus restoration on unmount
  useEffect(() => {
    return () => {
      if (returnFocus && previouslyFocusedElementRef.current) {
        try {
          previouslyFocusedElementRef.current.focus();
        } catch {
          // Target element might be detached
        }
      }
    };
  }, [returnFocus]);

  // Focus restoration when modal closes (isOpen transitions to false)
  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      if (returnFocus && previouslyFocusedElementRef.current) {
        try {
          previouslyFocusedElementRef.current.focus();
        } catch {
          // Target element might be detached
        }
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, returnFocus]);

  return containerRef;
}
