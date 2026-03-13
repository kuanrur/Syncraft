import { getDb } from './client';
import { MessageObservation } from '../types';

interface ObservationRow {
  id: number;
  slack_user_id: string;
  channel_id: string;
  thread_ts: string | null;
  parent_user_id: string | null;
  word_count: number;
  has_greeting: number;
  has_signoff: number;
  has_emoji: number;
  formality_score: number;
  detected_intent: string;
  is_question: number;
  is_thread_reply: number;
  is_weekend: number;
  hour_local: number | null;
  timestamp_utc: string;
}

function rowToObservation(row: ObservationRow): MessageObservation & { id: number } {
  return {
    id: row.id,
    slackUserId: row.slack_user_id,
    channelId: row.channel_id,
    threadTs: row.thread_ts,
    parentUserId: row.parent_user_id,
    wordCount: row.word_count,
    hasGreeting: row.has_greeting === 1,
    hasSignoff: row.has_signoff === 1,
    hasEmoji: row.has_emoji === 1,
    formalityScore: row.formality_score,
    detectedIntent: row.detected_intent as MessageObservation['detectedIntent'],
    isQuestion: row.is_question === 1,
    isThreadReply: row.is_thread_reply === 1,
    isWeekend: row.is_weekend === 1,
    hourLocal: row.hour_local,
    timestampUtc: row.timestamp_utc,
  };
}

export function insertObservation(obs: MessageObservation): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO message_observations
      (slack_user_id, channel_id, thread_ts, parent_user_id, word_count, has_greeting, has_signoff, has_emoji, formality_score, detected_intent, is_question, is_thread_reply, is_weekend, hour_local, timestamp_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    obs.slackUserId,
    obs.channelId,
    obs.threadTs,
    obs.parentUserId,
    obs.wordCount,
    obs.hasGreeting ? 1 : 0,
    obs.hasSignoff ? 1 : 0,
    obs.hasEmoji ? 1 : 0,
    obs.formalityScore,
    obs.detectedIntent,
    obs.isQuestion ? 1 : 0,
    obs.isThreadReply ? 1 : 0,
    obs.isWeekend ? 1 : 0,
    obs.hourLocal,
    obs.timestampUtc,
  );
}

export function getObservationsForUser(slackUserId: string): ReturnType<typeof rowToObservation>[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM message_observations
    WHERE slack_user_id = ? AND created_at >= datetime('now', '-30 days')
    ORDER BY timestamp_utc ASC
  `).all(slackUserId) as ObservationRow[];
  return rows.map(rowToObservation);
}

export function getObservationsForPair(userA: string, userB: string): ReturnType<typeof rowToObservation>[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM message_observations
    WHERE (slack_user_id = ? AND parent_user_id = ?) OR (slack_user_id = ? AND parent_user_id = ?)
    AND created_at >= datetime('now', '-30 days')
    ORDER BY timestamp_utc ASC
  `).all(userA, userB, userB, userA) as ObservationRow[];
  return rows.map(rowToObservation);
}

export function getRecentObservationCount(slackUserId: string): number {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM message_observations
    WHERE slack_user_id = ? AND created_at >= datetime('now', '-30 days')
  `).get(slackUserId) as { count: number };
  return result.count;
}

export function getTotalObservationCount(): number {
  const db = getDb();
  const result = db.prepare(`SELECT COUNT(*) as count FROM message_observations`).get() as { count: number };
  return result.count;
}
