import { LS_KEYS, EVENTS } from "../../constants";

const { useState, useCallback, useEffect } = Spicetify.React;

export const DEFAULT_ORDER: string[] = [
  "overview",
  "toplists",
  "genres",
  "activity",
  "recent",
];

/**
 * Hook to manage the order of dashboard sections with localStorage persistence.
 * Validates stored order on load: removes stale IDs and appends missing IDs
 * so that new sections added in future updates appear at the end.
 * Listens for EVENTS.RESET_LAYOUT custom event to reset order
 * (dispatched by Settings panel Reset button).
 */
export function useSectionOrder() {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(LS_KEYS.CARD_ORDER);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) {
          // Remove IDs not in DEFAULT_ORDER (stale), keep valid ones in saved order
          const validated = parsed.filter((id) => DEFAULT_ORDER.includes(id));
          // Append any new section IDs not yet in the saved order
          for (const id of DEFAULT_ORDER) {
            if (!validated.includes(id)) {
              validated.push(id);
            }
          }
          return validated;
        }
      }
    } catch (e) {
      console.warn("[listening-stats] Section order access failed", e);
    }
    return [...DEFAULT_ORDER];
  });

  const reorder = useCallback((newOrder: string[]) => {
    setOrder(newOrder);
    try {
      localStorage.setItem(LS_KEYS.CARD_ORDER, JSON.stringify(newOrder));
    } catch (e) {
      console.warn("[listening-stats] Section order access failed", e);
    }
  }, []);

  const resetOrder = useCallback(() => {
    const defaultCopy = [...DEFAULT_ORDER];
    setOrder(defaultCopy);
    try {
      localStorage.setItem(LS_KEYS.CARD_ORDER, JSON.stringify(defaultCopy));
    } catch (e) {
      console.warn("[listening-stats] Section order access failed", e);
    }
  }, []);

  // Listen for reset-layout custom event from Settings panel
  useEffect(() => {
    const handler = () => resetOrder();
    window.addEventListener(EVENTS.RESET_LAYOUT, handler);
    return () => {
      window.removeEventListener(EVENTS.RESET_LAYOUT, handler);
    };
  }, [resetOrder]);

  return { order, reorder, resetOrder };
}
