// Event-fed client state: one SSE connection feeds the Timeline and invalidates queries.
import type { HarnessEvent } from "@harness/shared";
import { useEffect, useRef, useState } from "react";
import { openEventStream } from "../api/client";

const MAX_EVENTS = 500;

export function useEventStream(onEvent?: (e: HarnessEvent) => void) {
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "reconnecting">("connecting");
  const lastId = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    return openEventStream((e) => {
      if (e.id <= lastId.current) return; // never show duplicates after a resume
      lastId.current = e.id;
      setEvents((prev) => [e, ...prev].slice(0, MAX_EVENTS));
      onEventRef.current?.(e);
    }, setStatus);
  }, []);

  return { events, status };
}
