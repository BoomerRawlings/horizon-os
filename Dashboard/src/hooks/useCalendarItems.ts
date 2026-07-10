import { useCallback, useEffect, useState } from "react";
import type { RcfCalendarItem } from "../types";
import { localIsoDate } from "../utils/rcfCalendar";

type CalendarItemsResponse = {
  today?: string;
  items?: RcfCalendarItem[];
};

type CalendarItemsState = {
  error: string | null;
  items: RcfCalendarItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  today: string;
};

export function useCalendarItems(): CalendarItemsState {
  const [items, setItems] = useState<RcfCalendarItem[]>([]);
  const [today, setToday] = useState(localIsoDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/items", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Calendar failed to load (${response.status})`);
      }

      const data = (await response.json()) as CalendarItemsResponse;
      setItems(Array.isArray(data.items) ? data.items : []);
      setToday(data.today || localIsoDate(new Date()));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Calendar failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const refreshTimer = window.setInterval(() => {
      void refresh();
    }, 60_000);

    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return { error, items, loading, refresh, today };
}
