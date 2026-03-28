import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IntelEvent } from "../types";

export function useIntelEvents() {
  const [events, setEvents] = useState<IntelEvent[]>([]);
  const lastEventTimesRef = useRef<Record<string, number>>({});

  const addEvent = useCallback((event: Omit<IntelEvent, "id" | "time">) => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    // Throttle 'new' and 'lost' events to 1 every 1s per category to prevent visual spam.
    // Critical alerts (type: 'alert') always bypass this throttle.
    if (event.type !== "alert") {
      const typeKey = `${event.type}-${event.entityType || "unknown"}`;
      const lastTime = lastEventTimesRef.current[typeKey] || 0;
      if (now - lastTime < 1000) return;
      lastEventTimesRef.current[typeKey] = now;
    }

    setEvents((prev: IntelEvent[]) =>
      [
        {
          ...event,
          id:
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `fallback-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          time: new Date(),
        },
        ...prev,
      ]
        .filter((e) => e.time.getTime() > oneHourAgo)
        .slice(0, 500),
    );
  }, []);

  // Periodic cleanup for events older than 1 hour
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      setEvents((prev: IntelEvent[]) => {
        const filtered = prev.filter((e) => e.time.getTime() > oneHourAgo);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const alertsCount = useMemo(
    () => events.filter((e) => e.type === "alert").length,
    [events],
  );

  return { events, addEvent, alertsCount };
}
