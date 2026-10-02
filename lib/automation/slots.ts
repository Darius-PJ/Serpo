// Cadence slot math in the user's IANA timezone. Instants are stored in UTC;
// slots are named in local wall-clock time, so a daily slot stays at local
// midnight across DST changes. Pure: no database, no clock of its own.
import type { Cadence } from "./cadence";

interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;
}

interface WallTime extends LocalDate {
  hour: number;
  minute: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** This computer's IANA timezone, used when the user has not chosen one. */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function wallTimeAt(instant: number, timeZone: string): WallTime & { second: number } {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

/** How far the zone's wall clock is ahead of UTC at this instant, in ms. */
function offsetAt(instant: number, timeZone: string): number {
  const wall = wallTimeAt(instant, timeZone);
  const wholeSeconds = instant - (((instant % 1000) + 1000) % 1000);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - wholeSeconds;
}

/**
 * The instant a local wall-clock time names in timeZone. A time a DST jump
 * skips lands the same distance past the jump (00:00 on a day that starts at
 * 01:00 resolves to 01:00); a time a fall-back repeats resolves to its first
 * occurrence.
 */
export function zonedTimeToInstant(wall: WallTime, timeZone: string): Date {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const offsetBefore = offsetAt(asUtc - DAY_MS, timeZone);
  const offsetAfter = offsetAt(asUtc + DAY_MS, timeZone);
  const matches = [asUtc - offsetBefore, asUtc - offsetAfter].filter(
    (candidate) => candidate + offsetAt(candidate, timeZone) === asUtc,
  );
  if (matches.length > 0) return new Date(Math.min(...matches));
  // Skipped by a forward jump: the pre-jump offset carries it past the gap.
  return new Date(asUtc - offsetBefore);
}

function localDateOf(instant: Date, timeZone: string): LocalDate {
  const { year, month, day } = wallTimeAt(instant.getTime(), timeZone);
  return { year, month, day };
}

function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Local hours at which this cadence has a slot on the given calendar day. */
function slotHours(date: LocalDate, cadence: Cadence): number[] {
  switch (cadence) {
    case "daily":
      return [0];
    case "weekdays": {
      const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
      return weekday === 0 || weekday === 6 ? [] : [0];
    }
    case "every_12h":
      return [0, 12];
    case "every_6h":
      return [0, 6, 12, 18];
  }
}

function slotsOn(date: LocalDate, cadence: Cadence, timeZone: string): Date[] {
  return slotHours(date, cadence).map((hour) => zonedTimeToInstant({ ...date, hour, minute: 0 }, timeZone));
}

/**
 * The latest slot at or before now: the one window a run at now belongs to.
 * Every window missed while Serpo was closed collapses into this one, so a
 * search catches up once, not once per missed window.
 */
export function currentSlot(now: Date, cadence: Cadence, timeZone: string): Date {
  const today = localDateOf(now, timeZone);
  for (let back = 0; back <= 7; back++) {
    const slots = slotsOn(addDays(today, -back), cadence, timeZone).filter((slot) => slot <= now);
    if (slots.length > 0) return slots[slots.length - 1];
  }
  throw new Error(`cadence ${cadence} has no slot in the past week`);
}

/** The first slot strictly after now. */
export function nextSlotAfter(now: Date, cadence: Cadence, timeZone: string): Date {
  const today = localDateOf(now, timeZone);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const slots = slotsOn(addDays(today, ahead), cadence, timeZone).filter((slot) => slot > now);
    if (slots.length > 0) return slots[0];
  }
  throw new Error(`cadence ${cadence} has no slot in the coming week`);
}

/** The local calendar date as YYYY-MM-DD: the per-day key for daily scans. */
export function localDateKey(now: Date, timeZone: string): string {
  const { year, month, day } = localDateOf(now, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
