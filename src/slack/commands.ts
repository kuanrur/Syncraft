import { App } from '@slack/bolt';
import { getProfile } from '../db/profileRepo';
import { getUserTraits } from '../db/commTraitsRepo';
import { getAvailability } from '../services/availabilityService';
import { getReplyEstimate } from '../services/replyEstimateService';
import { buildAvailabilityBlocks, buildSuggestionModal } from './blocks';

export function registerCommand(app: App): void {
  app.command('/xiami', async ({ command, ack, respond, client, body }) => {
    await ack();

    const text = (command.text ?? '').trim();
    console.log('[/xiami] received text:', JSON.stringify(text));

    // Case 1: mention @user — handles both <@UID> and plain @username
    const mentionMatch = text.match(/<@(U[A-Z0-9]+)(?:\|[^>]*)?>/);
    const plainNameMatch = !mentionMatch && text.match(/^@?(\S+)$/) && !text.toLowerCase().startsWith('reply');

    if (mentionMatch || plainNameMatch) {
      let targetUserId: string;

      if (mentionMatch) {
        targetUserId = mentionMatch[1];
      } else {
        // Resolve plain @username to user ID via users.list
        const username = text.replace(/^@/, '').toLowerCase();
        let resolved: string | null = null;
        try {
          const list = await client.users.list({});
          const members = (list.members as any[]) ?? [];
          const found = members.find((m: any) =>
            m.name?.toLowerCase() === username ||
            m.profile?.display_name?.toLowerCase() === username ||
            m.real_name?.toLowerCase() === username
          );
          resolved = found?.id ?? null;
          if (!resolved) {
            console.log('[/xiami] looking for:', username);
            console.log('[/xiami] available members:', members.filter(m => !m.is_bot && !m.deleted).map((m: any) => ({
              id: m.id, name: m.name, display: m.profile?.display_name, real: m.real_name
            })));
          }
        } catch (e) {
          console.warn('[/xiami] users.list failed:', e);
        }
        if (!resolved) {
          await respond({ response_type: 'ephemeral', text: `Couldn't find user "@${username}" in this workspace.` });
          return;
        }
        targetUserId = resolved;
      }

      let targetName = targetUserId;
      try {
        const info = await client.users.info({ user: targetUserId });
        const u = info.user as any;
        console.log('[/xiami] user fields:', JSON.stringify({
          name: u?.name,
          real_name: u?.real_name,
          display_name: u?.profile?.display_name,
          display_name_normalized: u?.profile?.display_name_normalized,
        }));
        targetName = u?.profile?.display_name_normalized || u?.profile?.display_name || u?.real_name || u?.name || targetUserId;
      } catch (e) {
        console.warn('[/xiami] users.info error:', e);
      }

      const profile = getProfile(targetUserId);
      // Override displayName with freshly fetched name
      if (profile && targetName !== targetUserId) {
        profile.displayName = targetName;
      }
      if (!profile) {
        await respond({ response_type: 'ephemeral', text: 'No Xiami profile found for this user yet.' });
        return;
      }
      if (!profile.sharingEnabled) {
        await respond({ response_type: 'ephemeral', text: 'This user has chosen not to share their availability.' });
        return;
      }

      const availability = getAvailability(profile);
      const estimate = getReplyEstimate(availability.status, profile.responseSpeed);
      const traits = getUserTraits(targetUserId);

      await respond({
        response_type: 'ephemeral',
        blocks: buildAvailabilityBlocks(profile, availability, estimate, traits),
      });
      return;
    }

    // Case 2: /xiami reply
    if (text.toLowerCase().startsWith('reply')) {
      const threadTs = command.thread_ts ?? (body as any).thread_ts;
      if (!threadTs) {
        await respond({ response_type: 'ephemeral', text: 'Use `/xiami reply` inside a thread to get suggestions.' });
        return;
      }

      // Fetch parent message
      let parentText = '';
      let senderId = '';
      try {
        const result = await client.conversations.replies({
          channel: command.channel_id,
          ts: threadTs,
          limit: 1,
          oldest: threadTs,
        });
        const messages = result.messages as any[];
        if (messages && messages.length > 0) {
          parentText = messages[0].text ?? '';
          senderId = messages[0].user ?? '';
        }
      } catch (e) {
        await respond({ response_type: 'ephemeral', text: 'Something went wrong fetching the thread. Try again shortly.' });
        return;
      }

      if (!parentText) {
        await respond({ response_type: 'ephemeral', text: 'No message text found to analyze.' });
        return;
      }

      await openSuggestionModal({
        client,
        triggerId: (body as any).trigger_id,
        messageText: parentText,
        senderId,
        requesterId: command.user_id,
      });
      return;
    }

    // Case 3: help
    await respond({
      response_type: 'ephemeral',
      text: 'Usage:\n• `/xiami @someone` — Check availability\n• `/xiami reply` — Get reply suggestions (use in a thread)',
    });
  });
}

// Shared helper used by both commands.ts and shortcuts.ts
export async function openSuggestionModal({
  client,
  triggerId,
  messageText,
  senderId,
  requesterId,
}: {
  client: any;
  triggerId: string;
  messageText: string;
  senderId: string;
  requesterId: string;
}): Promise<void> {
  const { generateSuggestions } = await import('../services/replySuggestionService');
  const { classifyIntent } = await import('../services/intentClassifier');
  const { getProfile } = await import('../db/profileRepo');
  const { getUserTraits, getPairTraits, getTeamTraits } = await import('../db/commTraitsRepo');

  const URGENCY_KEYWORDS = ['asap', 'urgent', 'blocking', 'eod', 'critical', 'immediately'];
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

  // Build context summary lines
  const contextSummary: string[] = [];
  if (senderTraits && senderTraits.messagesSampled >= 10) {
    contextSummary.push(`Sender prefers: ${senderTraits.lengthBucket} messages, ${senderTraits.formality}`);
    if (senderTraits.topIntentsSent.length > 0) {
      contextSummary.push(`They typically ask for: ${senderTraits.topIntentsSent.join(', ')}`);
    }
    if (pairTraits && pairTraits.avgResponseTimeAtoBMin > 0) {
      contextSummary.push(`Your usual reply time to them: ~${Math.round(pairTraits.avgResponseTimeAtoBMin)} min`);
    }
    if (senderTraits.statedPreferences.length > 0) {
      contextSummary.push(`Note: "${senderTraits.statedPreferences[0]}" — @${senderId}`);
    }
  }

  // Get sender display name
  let senderName = senderId;
  try {
    const info = await client.users.info({ user: senderId });
    senderName = (info.user as any)?.display_name || (info.user as any)?.real_name || senderId;
  } catch (e) { /* ignore */ }

  const { buildSuggestionModal } = await import('./blocks');
  await client.views.open({
    trigger_id: triggerId,
    view: buildSuggestionModal(messageText, senderName, suggestions, contextSummary),
  });
}
