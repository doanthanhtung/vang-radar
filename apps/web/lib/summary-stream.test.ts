import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToSummaryStream } from "./summary-stream";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private listeners = new Map<string, Array<(event: { data: string }) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close = vi.fn();

  emit(type: string, event = { data: "{}" }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.useRealTimers();
});

describe("summary stream fallback", () => {
  it("does not poll while SSE is connected", () => {
    vi.useFakeTimers();
    const refreshSummary = vi.fn().mockResolvedValue(undefined);
    const cleanup = subscribeToSummaryStream({
      streamUrl: "/stream",
      EventSourceCtor: FakeEventSource,
      refreshSummary,
      onSummary: vi.fn(),
      fallbackIntervalMs: 60_000
    });

    vi.advanceTimersByTime(120_000);

    expect(refreshSummary).not.toHaveBeenCalled();
    cleanup();
  });

  it("starts polling after SSE failure and stops when SSE reconnects", () => {
    vi.useFakeTimers();
    const refreshSummary = vi.fn().mockResolvedValue(undefined);
    const cleanup = subscribeToSummaryStream({
      streamUrl: "/stream",
      EventSourceCtor: FakeEventSource,
      refreshSummary,
      onSummary: vi.fn(),
      fallbackIntervalMs: 60_000
    });
    const eventSource = FakeEventSource.instances[0]!;

    eventSource.emit("error");
    vi.advanceTimersByTime(120_000);
    expect(refreshSummary).toHaveBeenCalledTimes(2);

    eventSource.emit("open");
    vi.advanceTimersByTime(120_000);
    expect(refreshSummary).toHaveBeenCalledTimes(2);
    cleanup();
  });
});
