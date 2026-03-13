import { getDb } from '../db/client';
import { upsertUserTraits, upsertPairTraits, upsertTeamTraits, getUserTraits } from '../db/commTraitsRepo';
import { UserCommTraits, PairCommTraits, TeamCommTraits, LengthBucket, Formality, MeetingStyle } from '../types';

// ── User Traits ──────────────────────────────────────────────────────────────

export function aggregateUserTraits(slackUserId: string): UserCommTraits {
  const db = getDb();

  const rows = db.prepare(`
    SELECT * FROM message_observations
    WHERE slack_user_id = ? AND created_at >= datetime('now', '-30 days')
    ORDER BY timestamp_utc ASC
  `).all(slackUserId) as any[];

  if (rows.length === 0) {
    // Return a default traits object
    const empty: UserCommTraits = {
      slackUserId,
      avgMessageLength: 0,
      lengthBucket: 'moderate',
      usesGreetings: false,
      usesSignoffs: false,
      usesEmoji: false,
      formality: 'mixed',
      peakActiveHoursLocal: [],
      avgResponseTimeMin: 0,
      respondsOnWeekends: false,
      topIntentsSent: [],
      topIntentsReceived: [],
      asksClarifyingQuestions: false,
      prefersThreads: false,
      typicalMeetingRequestStyle: 'unknown',
      preferredMeetingTimes: [],
      statedPreferences: [],
      messagesSampled: 0,
      lastUpdated: new Date().toISOString(),
    };
    return empty;
  }

  const count = rows.length;

  // avgMessageLength
  const avgMessageLength = rows.reduce((sum: number, r: any) => sum + r.word_count, 0) / count;

  // lengthBucket
  let lengthBucket: LengthBucket;
  if (avgMessageLength < 15) lengthBucket = 'terse';
  else if (avgMessageLength <= 60) lengthBucket = 'moderate';
  else lengthBucket = 'verbose';

  // boolean traits via frequency
  const greetingRate = rows.filter((r: any) => r.has_greeting).length / count;
  const signoffRate = rows.filter((r: any) => r.has_signoff).length / count;
  const emojiRate = rows.filter((r: any) => r.has_emoji).length / count;

  const usesGreetings = greetingRate > 0.3;
  const usesSignoffs = signoffRate > 0.3;
  const usesEmoji = emojiRate > 0.3;

  // formality
  const avgFormality = rows.reduce((sum: number, r: any) => sum + r.formality_score, 0) / count;
  let formality: Formality;
  if (avgFormality < -0.5) formality = 'casual';
  else if (avgFormality > 0.5) formality = 'formal';
  else formality = 'mixed';

  // peakActiveHours — find top-2 contiguous 2-hour windows
  const hourCounts = new Array(24).fill(0);
  for (const r of rows) {
    if (r.hour_local !== null) hourCounts[r.hour_local]++;
  }
  const peakActiveHoursLocal = findTopTwoHourWindows(hourCounts);

  // avgResponseTimeMin — median of thread reply response times
  const threadReplies = rows.filter((r: any) => r.is_thread_reply && r.parent_user_id);
  let avgResponseTimeMin = 0;
  if (threadReplies.length > 0) {
    // We approximate using timestamps (not the actual parent ts), compute inter-reply gaps
    const responseTimes: number[] = [];
    for (let i = 1; i < threadReplies.length; i++) {
      const prev = new Date(threadReplies[i - 1].timestamp_utc).getTime();
      const curr = new Date(threadReplies[i].timestamp_utc).getTime();
      const diffMin = (curr - prev) / 60000;
      if (diffMin > 0 && diffMin < 480) responseTimes.push(diffMin); // ignore gaps > 8h
    }
    if (responseTimes.length > 0) {
      responseTimes.sort((a, b) => a - b);
      avgResponseTimeMin = responseTimes[Math.floor(responseTimes.length / 2)]; // median
    }
  }

  // respondsOnWeekends
  const weekendCount = rows.filter((r: any) => r.is_weekend).length;
  const respondsOnWeekends = weekendCount >= 3;

  // topIntentsSent
  const intentCounts: Record<string, number> = {};
  for (const r of rows) {
    intentCounts[r.detected_intent] = (intentCounts[r.detected_intent] ?? 0) + 1;
  }
  const topIntentsSent = Object.entries(intentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([intent]) => intent);

  // asksClarifyingQuestions
  const threadReplyRows = rows.filter((r: any) => r.is_thread_reply);
  const questionThreadReplies = threadReplyRows.filter((r: any) => r.is_question);
  const asksClarifyingQuestions = threadReplyRows.length > 0
    ? questionThreadReplies.length / threadReplyRows.length > 0.3
    : false;

  // prefersThreads
  const threadRate = rows.filter((r: any) => r.is_thread_reply).length / count;
  const prefersThreads = threadRate > 0.6;

  // Retrieve existing statedPreferences (not recomputed here)
  const existingTraits = getUserTraits(slackUserId);
  const statedPreferences = existingTraits?.statedPreferences ?? [];

  const traits: UserCommTraits = {
    slackUserId,
    avgMessageLength,
    lengthBucket,
    usesGreetings,
    usesSignoffs,
    usesEmoji,
    formality,
    peakActiveHoursLocal,
    avgResponseTimeMin,
    respondsOnWeekends,
    topIntentsSent,
    topIntentsReceived: [], // filled by pair aggregation
    asksClarifyingQuestions,
    prefersThreads,
    typicalMeetingRequestStyle: existingTraits?.typicalMeetingRequestStyle ?? 'unknown',
    preferredMeetingTimes: existingTraits?.preferredMeetingTimes ?? [],
    statedPreferences,
    messagesSampled: count,
    lastUpdated: new Date().toISOString(),
  };

  upsertUserTraits(traits);
  return traits;
}

// ── Pair Traits ──────────────────────────────────────────────────────────────

export function aggregatePairTraits(userA: string, userB: string): PairCommTraits {
  const db = getDb();
  const [a, b] = [userA, userB].sort();

  const rows = db.prepare(`
    SELECT * FROM message_observations
    WHERE (slack_user_id = ? AND parent_user_id = ?) OR (slack_user_id = ? AND parent_user_id = ?)
    AND created_at >= datetime('now', '-30 days')
    ORDER BY timestamp_utc ASC
  `).all(a, b, b, a) as any[];

  const totalInteractions = rows.length;

  // Per-direction response times
  const atoBTimes: number[] = [];
  const btoATimes: number[] = [];
  const atoBIntents: string[] = [];
  const btoAIntents: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.slack_user_id === a && r.parent_user_id === b) {
      atoBIntents.push(r.detected_intent);
    } else if (r.slack_user_id === b && r.parent_user_id === a) {
      btoAIntents.push(r.detected_intent);
    }

    if (i > 0) {
      const prev = rows[i - 1];
      const diffMin = (new Date(r.timestamp_utc).getTime() - new Date(prev.timestamp_utc).getTime()) / 60000;
      if (diffMin > 0 && diffMin < 480) {
        if (r.slack_user_id === a) atoBTimes.push(diffMin);
        else btoATimes.push(diffMin);
      }
    }
  }

  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const dominantIntent = (arr: string[]): string => {
    if (arr.length === 0) return 'general';
    const counts: Record<string, number> = {};
    for (const i of arr) counts[i] = (counts[i] ?? 0) + 1;
    return Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0];
  };

  // dominantRequester — who initiates more
  const aToCount = atoBIntents.length;
  const bToCount = btoAIntents.length;
  const dominantRequester = aToCount > bToCount ? a : bToCount > aToCount ? b : null;

  // formalityMatch and lengthMatch — compare user traits
  const traitA = getUserTraits(a);
  const traitB = getUserTraits(b);
  const formalityMatch = !!(traitA && traitB && traitA.formality === traitB.formality);
  const lengthMatch = !!(traitA && traitB && traitA.lengthBucket === traitB.lengthBucket);

  const lastInteraction = rows.length > 0 ? rows[rows.length - 1].timestamp_utc : '';

  const traits: PairCommTraits = {
    userA: a,
    userB: b,
    totalInteractions,
    avgResponseTimeAtoBMin: median(atoBTimes),
    avgResponseTimeBtoAMin: median(btoATimes),
    dominantRequester,
    dominantIntentAtoB: dominantIntent(atoBIntents),
    dominantIntentBtoA: dominantIntent(btoAIntents),
    formalityMatch,
    lengthMatch,
    commonTopics: [],
    lastInteraction,
    messagesSampled: totalInteractions,
    lastUpdated: new Date().toISOString(),
  };

  upsertPairTraits(traits);
  return traits;
}

// ── Team Traits ──────────────────────────────────────────────────────────────

export function aggregateTeamTraits(workspaceId: string): TeamCommTraits {
  const db = getDb();

  const rows = db.prepare(`
    SELECT * FROM message_observations
    WHERE created_at >= datetime('now', '-30 days')
  `).all() as any[];

  if (rows.length === 0) {
    const empty: TeamCommTraits = {
      workspaceId,
      avgMessageLength: 0,
      dominantFormality: 'mixed',
      commonMeetingPattern: 'mixed',
      peakHoursUtc: [],
      avgResponseTimeMin: 0,
      lastUpdated: new Date().toISOString(),
    };
    upsertTeamTraits(empty);
    return empty;
  }

  const count = rows.length;
  const avgMessageLength = rows.reduce((sum: number, r: any) => sum + r.word_count, 0) / count;

  const avgFormality = rows.reduce((sum: number, r: any) => sum + r.formality_score, 0) / count;
  let dominantFormality: Formality;
  if (avgFormality < -0.5) dominantFormality = 'casual';
  else if (avgFormality > 0.5) dominantFormality = 'formal';
  else dominantFormality = 'mixed';

  const threadReplies = rows.filter((r: any) => r.is_thread_reply);
  let avgResponseTimeMin = 0;
  if (threadReplies.length > 1) {
    const times: number[] = [];
    for (let i = 1; i < threadReplies.length; i++) {
      const diff = (new Date(threadReplies[i].timestamp_utc).getTime() - new Date(threadReplies[i - 1].timestamp_utc).getTime()) / 60000;
      if (diff > 0 && diff < 480) times.push(diff);
    }
    if (times.length > 0) {
      avgResponseTimeMin = times.reduce((a, b) => a + b, 0) / times.length;
    }
  }

  // Peak hours UTC
  const hourCounts = new Array(24).fill(0);
  for (const r of rows) {
    if (r.hour_local !== null) {
      hourCounts[r.hour_local]++;
    }
  }
  const peakHoursUtc = findTopTwoHourWindows(hourCounts);

  const traits: TeamCommTraits = {
    workspaceId,
    avgMessageLength,
    dominantFormality,
    commonMeetingPattern: 'mixed',
    peakHoursUtc,
    avgResponseTimeMin,
    lastUpdated: new Date().toISOString(),
  };

  upsertTeamTraits(traits);
  return traits;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findTopTwoHourWindows(hourCounts: number[]): string[] {
  // Compute 2-hour window sums
  const windowScores = hourCounts.map((_, h) => {
    return { hour: h, score: hourCounts[h] + hourCounts[(h + 1) % 24] };
  });
  windowScores.sort((a, b) => b.score - a.score);

  const result: string[] = [];
  const used = new Set<number>();

  for (const w of windowScores) {
    if (result.length >= 2) break;
    if (used.has(w.hour) || used.has((w.hour + 1) % 24)) continue;
    if (w.score === 0) continue;
    result.push(`${String(w.hour).padStart(2, '0')}:00-${String((w.hour + 2) % 24).padStart(2, '0')}:00`);
    used.add(w.hour);
    used.add((w.hour + 1) % 24);
  }

  return result;
}
