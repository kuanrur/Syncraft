import type { WebClient } from '@slack/web-api';
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
  client: WebClient;
  /** Bolt's `respond` function — POSTs to the interaction's response_url. Works without bot channel membership. */
  respond: (msg: any) => Promise<unknown>;
  channelId: string;
  threadTs?: string | null;
  requesterId: string;
  senderId: string;
  messageText: string;
}

export async function postSuggestionChips(args: PostSuggestionChipsArgs): Promise<void> {
  const { client, respond, channelId, threadTs, senderId, requesterId, messageText } = args;
  console.log('[postSuggestionChips] entered', { channelId, threadTs, senderId, requesterId, textLen: messageText.length });

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

  // Trivial greeting (e.g., just "hi") — skip chips, post a small note instead.
  if (intent.intent === 'greeting' && messageText.trim().split(/\s+/).length <= 2) {
    await respond({
      response_type: 'ephemeral',
      text: 'Looks like a quick greeting — feel free to reply naturally.',
      thread_ts: threadTs ?? undefined,
    }).catch(() => { /* ignore */ });
    return;
  }

  const suggestions = generateSuggestions(context);

  // Resolve display name; fall back to id on failure (likely missing users:read scope)
  let senderName = senderId;
  try {
    const info = await client.users.info({ user: senderId });
    const u = (info.user as any) ?? {};
    senderName = u.profile?.display_name_normalized || u.profile?.display_name || u.real_name || u.name || senderId;
  } catch (err) {
    console.warn('[postSuggestionChips] users.info failed (name will show as ID):', err);
  }

  const contextLine = pickContextLine(suggestions, context, senderName);
  const blocks = buildSuggestionChipsBlocks(suggestions, contextLine, senderName);

  // Posting strategy:
  //   1. If we have a thread_ts, try chat.postEphemeral first — only this routes
  //      the ephemeral INTO the thread. response_url alone often lands in the
  //      channel root and the user (looking at the thread) sees nothing.
  //   2. If chat.postEphemeral fails because the bot isn't in the channel
  //      (or any other reason), fall back to respond() so the user at least
  //      sees the suggestions in the channel main view.
  let posted = false;
  if (channelId && threadTs) {
    try {
      await client.chat.postEphemeral({
        channel: channelId,
        user: requesterId,
        thread_ts: threadTs,
        text: 'Suggested replies',
        blocks,
      });
      posted = true;
    } catch (err: any) {
      if (err?.data?.error === 'not_in_channel') {
        console.warn('[postSuggestionChips] bot not in channel — falling back to response_url (ephemeral will land in channel root, not thread). /invite @Syncraft to fix.');
      } else {
        console.warn('[postSuggestionChips] chat.postEphemeral failed, falling back to respond:', err);
      }
    }
  }

  if (!posted) {
    try {
      await respond({
        response_type: 'ephemeral',
        text: 'Suggested replies',
        blocks,
      });
    } catch (err) {
      console.warn('[postSuggestionChips] respond failed:', err);
      try {
        await respond({
          response_type: 'ephemeral',
          text: "Couldn't post suggestions right now — please try again.",
        });
      } catch {
        // give up silently — already logged
      }
    }
  }
}
