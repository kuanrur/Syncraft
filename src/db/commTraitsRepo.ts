import { getDb } from './client';
import { UserCommTraits, PairCommTraits, TeamCommTraits, LengthBucket, Formality, MeetingStyle } from '../types';

// ── User Traits ──────────────────────────────────────────

interface UserTraitsRow {
  slack_user_id: string;
  avg_message_length: number;
  length_bucket: string;
  uses_greetings: number;
  uses_signoffs: number;
  uses_emoji: number;
  formality: string;
  peak_active_hours_json: string;
  avg_response_time_min: number;
  responds_on_weekends: number;
  top_intents_sent_json: string;
  top_intents_received_json: string;
  asks_clarifying_questions: number;
  prefers_threads: number;
  meeting_request_style: string;
  preferred_meeting_times_json: string;
  stated_preferences_json: string;
  messages_sampled: number;
  updated_at: string;
}

function rowToUserTraits(row: UserTraitsRow): UserCommTraits {
  return {
    slackUserId: row.slack_user_id,
    avgMessageLength: row.avg_message_length,
    lengthBucket: row.length_bucket as LengthBucket,
    usesGreetings: row.uses_greetings === 1,
    usesSignoffs: row.uses_signoffs === 1,
    usesEmoji: row.uses_emoji === 1,
    formality: row.formality as Formality,
    peakActiveHoursLocal: JSON.parse(row.peak_active_hours_json),
    avgResponseTimeMin: row.avg_response_time_min,
    respondsOnWeekends: row.responds_on_weekends === 1,
    topIntentsSent: JSON.parse(row.top_intents_sent_json),
    topIntentsReceived: JSON.parse(row.top_intents_received_json),
    asksClarifyingQuestions: row.asks_clarifying_questions === 1,
    prefersThreads: row.prefers_threads === 1,
    typicalMeetingRequestStyle: row.meeting_request_style as MeetingStyle,
    preferredMeetingTimes: JSON.parse(row.preferred_meeting_times_json),
    statedPreferences: JSON.parse(row.stated_preferences_json),
    messagesSampled: row.messages_sampled,
    lastUpdated: row.updated_at,
  };
}

export function getUserTraits(slackUserId: string): UserCommTraits | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_comm_traits WHERE slack_user_id = ?').get(slackUserId) as UserTraitsRow | undefined;
  return row ? rowToUserTraits(row) : null;
}

export function upsertUserTraits(traits: UserCommTraits): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_comm_traits
      (slack_user_id, avg_message_length, length_bucket, uses_greetings, uses_signoffs, uses_emoji, formality, peak_active_hours_json, avg_response_time_min, responds_on_weekends, top_intents_sent_json, top_intents_received_json, asks_clarifying_questions, prefers_threads, meeting_request_style, preferred_meeting_times_json, stated_preferences_json, messages_sampled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(slack_user_id) DO UPDATE SET
      avg_message_length = excluded.avg_message_length,
      length_bucket = excluded.length_bucket,
      uses_greetings = excluded.uses_greetings,
      uses_signoffs = excluded.uses_signoffs,
      uses_emoji = excluded.uses_emoji,
      formality = excluded.formality,
      peak_active_hours_json = excluded.peak_active_hours_json,
      avg_response_time_min = excluded.avg_response_time_min,
      responds_on_weekends = excluded.responds_on_weekends,
      top_intents_sent_json = excluded.top_intents_sent_json,
      top_intents_received_json = excluded.top_intents_received_json,
      asks_clarifying_questions = excluded.asks_clarifying_questions,
      prefers_threads = excluded.prefers_threads,
      meeting_request_style = excluded.meeting_request_style,
      preferred_meeting_times_json = excluded.preferred_meeting_times_json,
      stated_preferences_json = excluded.stated_preferences_json,
      messages_sampled = excluded.messages_sampled,
      updated_at = datetime('now')
  `).run(
    traits.slackUserId,
    traits.avgMessageLength,
    traits.lengthBucket,
    traits.usesGreetings ? 1 : 0,
    traits.usesSignoffs ? 1 : 0,
    traits.usesEmoji ? 1 : 0,
    traits.formality,
    JSON.stringify(traits.peakActiveHoursLocal),
    traits.avgResponseTimeMin,
    traits.respondsOnWeekends ? 1 : 0,
    JSON.stringify(traits.topIntentsSent),
    JSON.stringify(traits.topIntentsReceived),
    traits.asksClarifyingQuestions ? 1 : 0,
    traits.prefersThreads ? 1 : 0,
    traits.typicalMeetingRequestStyle,
    JSON.stringify(traits.preferredMeetingTimes),
    JSON.stringify(traits.statedPreferences),
    traits.messagesSampled,
  );
}

export function updateStatedPreferences(slackUserId: string, preferences: string[]): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_comm_traits (slack_user_id, stated_preferences_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(slack_user_id) DO UPDATE SET
      stated_preferences_json = excluded.stated_preferences_json,
      updated_at = datetime('now')
  `).run(slackUserId, JSON.stringify(preferences));
}

// ── Pair Traits ──────────────────────────────────────────

interface PairTraitsRow {
  user_a: string;
  user_b: string;
  total_interactions: number;
  avg_response_a_to_b_min: number;
  avg_response_b_to_a_min: number;
  dominant_requester: string | null;
  dominant_intent_a_to_b: string;
  dominant_intent_b_to_a: string;
  formality_match: number;
  length_match: number;
  common_topics_json: string;
  last_interaction: string | null;
  messages_sampled: number;
  updated_at: string;
}

function rowToPairTraits(row: PairTraitsRow): PairCommTraits {
  return {
    userA: row.user_a,
    userB: row.user_b,
    totalInteractions: row.total_interactions,
    avgResponseTimeAtoBMin: row.avg_response_a_to_b_min,
    avgResponseTimeBtoAMin: row.avg_response_b_to_a_min,
    dominantRequester: row.dominant_requester,
    dominantIntentAtoB: row.dominant_intent_a_to_b,
    dominantIntentBtoA: row.dominant_intent_b_to_a,
    formalityMatch: row.formality_match === 1,
    lengthMatch: row.length_match === 1,
    commonTopics: JSON.parse(row.common_topics_json),
    lastInteraction: row.last_interaction ?? '',
    messagesSampled: row.messages_sampled,
    lastUpdated: row.updated_at,
  };
}

export function getPairTraits(userA: string, userB: string): PairCommTraits | null {
  const db = getDb();
  const [a, b] = [userA, userB].sort();
  const row = db.prepare('SELECT * FROM pair_comm_traits WHERE user_a = ? AND user_b = ?').get(a, b) as PairTraitsRow | undefined;
  return row ? rowToPairTraits(row) : null;
}

export function upsertPairTraits(traits: PairCommTraits): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pair_comm_traits
      (user_a, user_b, total_interactions, avg_response_a_to_b_min, avg_response_b_to_a_min, dominant_requester, dominant_intent_a_to_b, dominant_intent_b_to_a, formality_match, length_match, common_topics_json, last_interaction, messages_sampled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_a, user_b) DO UPDATE SET
      total_interactions = excluded.total_interactions,
      avg_response_a_to_b_min = excluded.avg_response_a_to_b_min,
      avg_response_b_to_a_min = excluded.avg_response_b_to_a_min,
      dominant_requester = excluded.dominant_requester,
      dominant_intent_a_to_b = excluded.dominant_intent_a_to_b,
      dominant_intent_b_to_a = excluded.dominant_intent_b_to_a,
      formality_match = excluded.formality_match,
      length_match = excluded.length_match,
      common_topics_json = excluded.common_topics_json,
      last_interaction = excluded.last_interaction,
      messages_sampled = excluded.messages_sampled,
      updated_at = datetime('now')
  `).run(
    traits.userA,
    traits.userB,
    traits.totalInteractions,
    traits.avgResponseTimeAtoBMin,
    traits.avgResponseTimeBtoAMin,
    traits.dominantRequester,
    traits.dominantIntentAtoB,
    traits.dominantIntentBtoA,
    traits.formalityMatch ? 1 : 0,
    traits.lengthMatch ? 1 : 0,
    JSON.stringify(traits.commonTopics),
    traits.lastInteraction || null,
    traits.messagesSampled,
  );
}

// ── Team Traits ──────────────────────────────────────────

interface TeamTraitsRow {
  workspace_id: string;
  avg_message_length: number;
  dominant_formality: string;
  common_meeting_pattern: string;
  peak_hours_utc_json: string;
  avg_response_time_min: number;
  updated_at: string;
}

function rowToTeamTraits(row: TeamTraitsRow): TeamCommTraits {
  return {
    workspaceId: row.workspace_id,
    avgMessageLength: row.avg_message_length,
    dominantFormality: row.dominant_formality as Formality,
    commonMeetingPattern: row.common_meeting_pattern,
    peakHoursUtc: JSON.parse(row.peak_hours_utc_json),
    avgResponseTimeMin: row.avg_response_time_min,
    lastUpdated: row.updated_at,
  };
}

export function getTeamTraits(workspaceId: string): TeamCommTraits | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM team_comm_traits WHERE workspace_id = ?').get(workspaceId) as TeamTraitsRow | undefined;
  return row ? rowToTeamTraits(row) : null;
}

export function upsertTeamTraits(traits: TeamCommTraits): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO team_comm_traits
      (workspace_id, avg_message_length, dominant_formality, common_meeting_pattern, peak_hours_utc_json, avg_response_time_min, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(workspace_id) DO UPDATE SET
      avg_message_length = excluded.avg_message_length,
      dominant_formality = excluded.dominant_formality,
      common_meeting_pattern = excluded.common_meeting_pattern,
      peak_hours_utc_json = excluded.peak_hours_utc_json,
      avg_response_time_min = excluded.avg_response_time_min,
      updated_at = datetime('now')
  `).run(
    traits.workspaceId,
    traits.avgMessageLength,
    traits.dominantFormality,
    traits.commonMeetingPattern,
    JSON.stringify(traits.peakHoursUtc),
    traits.avgResponseTimeMin,
  );
}

// ── Delete User Data ─────────────────────────────────────

export function deleteUserData(slackUserId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM message_observations WHERE slack_user_id = ?').run(slackUserId);
  db.prepare('DELETE FROM user_comm_traits WHERE slack_user_id = ?').run(slackUserId);
  db.prepare('DELETE FROM pair_comm_traits WHERE user_a = ? OR user_b = ?').run(slackUserId, slackUserId);
}
