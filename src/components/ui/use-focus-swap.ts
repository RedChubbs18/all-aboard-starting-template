"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * When a control unmounts as a form opens or closes, move focus to the first field on open and back to the
 * `[data-opener]` button on close, so keyboard focus is never dropped to <body> (WCAG 2.4.3).
 * `root` must contain both the opener and the form.
 */
export function useFocusSwap(open: boolean, root: RefObject<HTMLElement | null>) {
  const prev = useRef(open);
  useEffect(() => {
    if (prev.current !== open) root.current?.querySelector<HTMLElement>(open ? "form input, form select, form textarea" : "[data-opener]")?.focus();
    prev.current = open;
  }, [open, root]);
}
