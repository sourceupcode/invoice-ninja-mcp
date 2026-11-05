// Task time accounting.
//
// The Task model has a `duration` column, and it is NOT the logged time: it is
// 0 for every task in a live instance while time_log carries hours of entries
// (verified: duration=0 with 6/19/5 entries in time_log, one task totalling
// 232200s ≈ 64.5h). Anything that reports task time must therefore derive it
// from time_log, or it will bill 0 — silently and plausibly.
//
// time_log is a JSON *string* of [start, end] unix-second pairs. A timer still
// running is stored with an empty end, which must be measured up to now.

export interface TimeLogEntry {
  start: number;
  end: number | null;
}

export function parseTimeLog(raw: unknown): TimeLogEntry[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: TimeLogEntry[] = [];
  for (const item of parsed) {
    if (!Array.isArray(item) || item.length === 0) continue;
    const start = Number(item[0]);
    if (!Number.isFinite(start)) continue;
    const rawEnd = item[1];
    const end = rawEnd === "" || rawEnd === null || rawEnd === undefined ? null : Number(rawEnd);
    entries.push({ start, end: Number.isFinite(end as number) ? (end as number) : null });
  }
  return entries;
}

/** Total logged seconds. A still-running entry is measured up to `nowSeconds`. */
export function totalSeconds(raw: unknown, nowSeconds = Math.floor(Date.now() / 1000)): number {
  return parseTimeLog(raw).reduce((sum, e) => {
    const end = e.end === null ? nowSeconds : e.end;
    return sum + Math.max(0, end - e.start);
  }, 0);
}

export function isRunning(raw: unknown): boolean {
  return parseTimeLog(raw).some((e) => e.end === null);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0h";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h${m}m` : `${h}h`;
}

/** Human-readable time log, one line per entry. */
export function describeTimeLog(raw: unknown): string {
  const entries = parseTimeLog(raw);
  if (entries.length === 0) return "none";

  return entries
    .map((e) => {
      const from = stamp(e.start);
      if (e.end === null) return `${from} → running`;
      return `${from} → ${stamp(e.end)} (${Math.round((e.end - e.start) / 60)}m)`;
    })
    .join("\n");
}

function stamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 16);
}
