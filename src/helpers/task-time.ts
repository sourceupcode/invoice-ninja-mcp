// Task time accounting.
//
// The Task model also has a `duration` column, and it is NOT the logged time: it
// is 0 for every task in a live instance while time_log carries hours of entries
// (verified: duration=0 with 19 entries totalling 232200s). Anything reporting
// task time must derive it from time_log.
//
// time_log is a JSON *string* whose entries carry up to four elements:
//
//   [0] start     unix seconds (required)
//   [1] end       unix seconds, or "" / absent while a timer runs
//   [2] note      free-text description for this entry (string)
//   [3] billable  boolean; absent means billable
//
// Verified against StoreTaskRequest/UpdateTaskRequest, which validate element [2]
// as a string and element [3] as a boolean and reject more than four elements.
// An earlier version of this file assumed [start, end] only and therefore threw
// away the per-entry note slot when writing entries — it is the canonical place
// for a note tied to one block of time.

export interface TimeLogEntry {
  start: number;
  end: number | null;
  note: string;
  billable: boolean;
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
    const note = typeof item[2] === "string" ? item[2] : "";
    // Absent [3] means billable; only an explicit false excludes the entry.
    const billable = item[3] === undefined || item[3] === null ? true : Boolean(item[3]);
    entries.push({
      start,
      end: Number.isFinite(end as number) ? (end as number) : null,
      note,
      billable,
    });
  }
  return entries;
}

/**
 * Total logged seconds. A still-running entry is measured up to `nowSeconds`.
 * Pass billableOnly to exclude entries explicitly marked non-billable, which is
 * what money figures must use.
 */
export function totalSeconds(
  raw: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
  billableOnly = false,
): number {
  return parseTimeLog(raw).reduce((sum, e) => {
    if (billableOnly && !e.billable) return sum;
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

/** Human-readable time log, one line per entry, including its note. */
export function describeTimeLog(raw: unknown): string {
  const entries = parseTimeLog(raw);
  if (entries.length === 0) return "none";

  return entries
    .map((e) => {
      const from = stamp(e.start);
      const span =
        e.end === null
          ? `${from} → running`
          : `${from} → ${stamp(e.end)} (${Math.round((e.end - e.start) / 60)}m)`;
      const bits = [span];
      if (e.note) bits.push(`note: ${e.note}`);
      if (!e.billable) bits.push("non-billable");
      return bits.join("  ·  ");
    })
    .join("\n");
}

function stamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 16);
}
