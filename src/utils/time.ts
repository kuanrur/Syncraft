import { DateTime, IANAZone } from 'luxon';

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isInWrappingRange(current: number, start: number, end: number): boolean {
  if (start <= end) {
    return current >= start && current < end;
  } else {
    // Wraps midnight
    return current >= start || current < end;
  }
}

export function formatLocalTime(timezone: string): string {
  const zone = IANAZone.isValidZone(timezone) ? timezone : 'UTC';
  return DateTime.now().setZone(zone).toFormat('h:mm a');
}

export function isValidTimezone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

export function nowInZone(timezone: string): DateTime {
  const zone = IANAZone.isValidZone(timezone) ? timezone : 'UTC';
  return DateTime.now().setZone(zone);
}

export function tsToDateTimeInZone(ts: string, timezone: string | null): DateTime {
  const zone = timezone && IANAZone.isValidZone(timezone) ? timezone : 'UTC';
  // Slack timestamps are Unix seconds with decimal
  const ms = parseFloat(ts) * 1000;
  return DateTime.fromMillis(ms).setZone(zone);
}
