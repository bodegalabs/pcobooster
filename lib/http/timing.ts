export function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function elapsedMs(
  startedAtMs: number,
  endedAtMs: number = nowMs()
): number {
  return Math.max(0, endedAtMs - startedAtMs);
}

export function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs)) return "0.0";
  return Math.max(0, durationMs).toFixed(1);
}

export function setRouteTimingHeaders(
  headers: Headers,
  durationMs: number
): void {
  const formatted = formatDurationMs(durationMs);
  headers.set("Server-Timing", `app;dur=${formatted}`);
  headers.set("x-worshipadmin-route-ms", formatted);
}
