import type { SuggestionContext, ReplySuggestion } from '../types';
import { PAIR_FRICTION_THRESHOLD_MIN } from '../constants';
import { generateSuggestions } from '../services/replySuggestionService';
import { classifyIntent } from '../services/intentClassifier';
import { getProfile } from '../db/profileRepo';
import { getUserTraits, getPairTraits, getTeamTraits } from '../db/commTraitsRepo';
import { buildSuggestionChipsBlocks } from './blocks';

export function pickContextLine(
  suggestions: ReplySuggestion[],
  context: SuggestionContext,
  senderName: string,
): string | null {
  // Rule 1: stated preference
  const pref = context.senderTraits?.statedPreferences?.[0];
  if (pref) {
    return `💡 ${senderName} has said: "${pref}"`;
  }

  // Rule 2: urgency
  if (context.isUrgent) {
    return '⚡ Looks urgent — a quick ack now is better than a long reply later';
  }

  // Rule 3: pair-friction (avg reply time > PAIR_FRICTION_THRESHOLD_MIN in the requester→sender direction)
  if (context.pairTraits) {
    const requesterIsA = context.requesterId <= context.senderId;
    const myReplyTime = requesterIsA
      ? context.pairTraits.avgResponseTimeAtoBMin
      : context.pairTraits.avgResponseTimeBtoAMin;
    if (myReplyTime > PAIR_FRICTION_THRESHOLD_MIN) {
      return `⏱ You usually reply to ${senderName} in 2+ hours — a fast ack helps`;
    }
  }

  // Rule 4: status-check pattern (the unlocked "Proactive update" suggestion is present)
  if (suggestions.some(s => s.label === 'Proactive update')) {
    return `📊 ${senderName} often follows up for status — a proactive update can prevent the next ping`;
  }

  return null;
}

const URGENCY_KEYWORDS = ['asap', 'urgent', 'blocking', 'eod', 'critical', 'immediately'];

export interface PostSuggestionChipsArgs {
  client: any;
  channelId: string;
  threadTs?: string | null;
  requesterId: string;
  senderId: string;
  messageText: string;
}

export async function postSuggestionChips(args: PostSuggestionChipsArgs): Promise<void> {
  const { client, channelId, threadTs, requesterId, senderId, messageText } = args;

  if (!channelId) {
    console.warn('[postSuggestionChips] missing channelId, skipping');
    return;
  }

  const isUrgent = URGENCY_KEYWORDS.some(kw => messageText.toLowerCase().includes(kw));
  const intent = classifyIntent(messageText);
  const senderProfile = getProfile(senderId);
  const senderTraits = getUserTraits(senderId);
  const requesterTraits = getUserTraits(requesterId);
  const [uA, uB] = [senderId, requesterId].sort();
  const pairTraits = getPairTraits(uA, uB);
  const teamTraits = getTeamTraits('default');

  const context = {
    messageText,
    senderId,
    requesterId,
    senderProfile,
    senderTraits,
    requesterTraits,
    pairTraits,
    teamTraits,
    intent,
    isUrgent,
  };

  const suggestions = generateSuggestions(context);

  // Resolve display name; fall back to id on failure (likely missing users:read scope)
  let senderName = senderId;
  try {
    const info = await client.users.info({ user: senderId });
    const u = (info.user as any) ?? {};
    senderName = u.profile?.display_name_normalized || u.profile?.display_name || u.real_name || u.name || senderId;
  } catch {
    // ignore — keep senderId
  }

  const contextLine = pickContextLine(suggestions, context, senderName);
  const blocks = buildSuggestionChipsBlocks(suggestions, contextLine, senderName);

  try {
    await client.chat.postEphemeral({
      channel: channelId,
      user: requesterId,
      thread_ts: threadTs ?? undefined,
      text: 'Suggested replies',
      blocks,
    });
  } catch (err) {
    console.warn('[postSuggestionChips] postEphemeral failed:', err);
    // Best-effort surface to user
    try {
      await client.chat.postEphemeral({
        channel: channelId,
        user: requesterId,
        text: "Couldn't post suggestions here — try again from a channel.",
      });
    } catch {
      // give up silently — already logged
    }
  }
}
