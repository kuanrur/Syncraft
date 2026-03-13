export type MeetingRequestStyle = 'proposes_specific_time' | 'asks_for_availability' | 'defers_to_other' | 'unknown';
export type MeetingTimePreference = 'morning' | 'afternoon' | 'evening';

const MEETING_KEYWORDS = [
  'meet', 'meeting', 'call', 'sync', 'standup', '1:1', 'one-on-one',
  'huddle', 'catch up', 'jump on', 'schedule', 'calendar', 'block time',
  'free at', 'available at', 'works for me', 'how about', "let's find",
];

const SPECIFIC_TIME_PATTERNS = [
  /\d{1,2}(:\d{2})?\s*(am|pm)/i,
  /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i,
  /\d{1,2}\/\d{1,2}/,
  /tomorrow|next week/i,
];

const AVAILABILITY_PATTERNS = [
  'when are you free',
  'what times work',
  'send me your availability',
  'when works for you',
  "what's your availability",
];

const DEFER_PATTERNS = [
  'whenever works for you',
  "i'm flexible",
  'you pick',
  'whatever works',
  'up to you',
];

export function hasMeetingKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return MEETING_KEYWORDS.some(kw => lower.includes(kw));
}

export function detectMeetingStyle(text: string): MeetingRequestStyle {
  const lower = text.toLowerCase();

  if (DEFER_PATTERNS.some(p => lower.includes(p))) return 'defers_to_other';
  if (AVAILABILITY_PATTERNS.some(p => lower.includes(p))) return 'asks_for_availability';
  if (SPECIFIC_TIME_PATTERNS.some(p => p.test(text))) return 'proposes_specific_time';

  return 'unknown';
}

export function detectMeetingTimePreferences(text: string): MeetingTimePreference[] {
  const lower = text.toLowerCase();
  const prefs: MeetingTimePreference[] = [];

  if (lower.includes('morning') || lower.includes(' am ') || lower.includes(' am,')) prefs.push('morning');
  if (lower.includes('afternoon') || lower.includes('after lunch') || lower.includes(' pm ') || lower.includes(' pm,')) prefs.push('afternoon');
  if (lower.includes('evening') || lower.includes('end of day') || lower.includes('eod')) prefs.push('evening');

  return prefs;
}
