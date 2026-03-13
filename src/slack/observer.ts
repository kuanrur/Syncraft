import { App } from '@slack/bolt';
import { getProfile } from '../db/profileRepo';
import { insertObservation, getRecentObservationCount, getTotalObservationCount } from '../db/observationRepo';
import { getUserTraits, updateStatedPreferences } from '../db/commTraitsRepo';
import { analyzeMessage } from '../services/messageAnalyzer';
import { detectPreferences } from '../services/preferenceDetector';
import { hasMeetingKeyword } from '../services/meetingDetector';
import { aggregateUserTraits, aggregatePairTraits, aggregateTeamTraits } from '../services/traitAggregator';

// In-memory counters for lazy aggregation
const userObsCounter = new Map<string, number>();

export function registerObserver(app: App): void {
  app.message(async ({ message, event }) => {
    // Fire-and-forget — do NOT await heavy work
    setImmediate(() => processMessage(message as any).catch(err => {
      console.warn('[observer] Error processing message:', err);
    }));
  });
}

async function processMessage(message: any): Promise<void> {
  // Filter
  if (message.subtype) return;
  if (message.bot_id) return;
  if (message.channel_type !== 'channel') return;

  const userId: string = message.user;
  if (!userId) return;

  const profile = getProfile(userId);
  if (!profile || !profile.sharingEnabled) return;

  const text: string = message.text ?? '';
  const channelId: string = message.channel ?? '';
  const messageTs: string = message.ts ?? '';
  const threadTs: string | null = message.thread_ts ?? null;

  // Determine parent user — requires looking up the thread root
  // We store parentUserId if available from the message event (reply_users, etc.)
  const parentUserId: string | null = (message.parent_user_id as string | undefined) ?? null;

  // Analyze (text is discarded after this)
  const observation = analyzeMessage(
    text,
    userId,
    channelId,
    threadTs,
    parentUserId,
    messageTs,
    profile.timezone,
  );

  // Store observation
  insertObservation(observation);

  // Detect preferences
  if (text) {
    const prefs = detectPreferences(text);
    if (prefs.length > 0) {
      const traits = getUserTraits(userId);
      const existing = traits?.statedPreferences ?? [];
      const merged = [...prefs, ...existing].slice(0, 10); // FIFO, max 10
      updateStatedPreferences(userId, merged);
    }
  }

  // Lazy aggregation — every 20 observations per user
  const prev = userObsCounter.get(userId) ?? 0;
  const next = prev + 1;
  userObsCounter.set(userId, next);

  if (next % 20 === 0) {
    aggregateUserTraits(userId);
    if (parentUserId) {
      aggregatePairTraits(userId, parentUserId);
    }
    userObsCounter.set(userId, 0);
  }

  // Every 100 total observations, aggregate team
  const total = getTotalObservationCount();
  if (total % 100 === 0) {
    aggregateTeamTraits('default');
  }
}
