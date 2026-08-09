type SummaryEvent = { data: string };

type EventSourceLike = {
  addEventListener(type: string, listener: (event: SummaryEvent) => void): void;
  close(): void;
};

type EventSourceConstructor = new (url: string) => EventSourceLike;

type SummaryStreamOptions = {
  streamUrl: string;
  EventSourceCtor: EventSourceConstructor | null;
  refreshSummary: () => Promise<unknown>;
  onSummary: (event: SummaryEvent) => void;
  fallbackIntervalMs: number;
};

export function subscribeToSummaryStream({
  streamUrl,
  EventSourceCtor,
  refreshSummary,
  onSummary,
  fallbackIntervalMs
}: SummaryStreamOptions): () => void {
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  const events = EventSourceCtor ? new EventSourceCtor(streamUrl) : null;

  const stopPolling = () => {
    if (!fallbackTimer) return;
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  };

  const startPolling = () => {
    if (fallbackTimer) return;
    fallbackTimer = setInterval(() => void refreshSummary().catch(() => undefined), fallbackIntervalMs);
  };

  if (!events) {
    startPolling();
    return stopPolling;
  }

  events.addEventListener("summary", onSummary);
  events.addEventListener("error", startPolling);
  events.addEventListener("open", stopPolling);

  return () => {
    stopPolling();
    events.close();
  };
}
