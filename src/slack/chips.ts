import type { SuggestionContext, ReplySuggestion } from '../types';

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

  // Rule 3: pair-friction (median reply time > 120 min in the requester→sender direction)
  if (context.pairTraits) {
    const [a] = [context.requesterId, context.senderId].sort();
    const requesterIsA = context.requesterId === a;
    const myReplyTime = requesterIsA
      ? context.pairTraits.avgResponseTimeAtoBMin
      : context.pairTraits.avgResponseTimeBtoAMin;
    if (myReplyTime > 120) {
      return `⏱ You usually reply to ${senderName} in 2+ hours — a fast ack helps`;
    }
  }

  // Rule 4: status-check pattern (the unlocked "Proactive update" suggestion is present)
  if (suggestions.some(s => s.label === 'Proactive update')) {
    return `📊 ${senderName} often follows up for status — a proactive update can prevent the next ping`;
  }

  return null;
}
