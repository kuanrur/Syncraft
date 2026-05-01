import { App } from '@slack/bolt';
import { getProfile } from '../db/profileRepo';
import { getAvailability } from '../services/availabilityService';
import { getReplyEstimate } from '../services/replyEstimateService';
import { classifyIntent } from '../services/intentClassifier';
import { buildAnalysisModal, buildCopySwapBlocks, buildSuggestionChipsBlocks } from './blocks';
import { postSuggestionChips } from './chips';

function extractMessageText(message: any): string {
  if (!message) return '';
  if (typeof message.text === 'string' && message.text.trim()) return message.text;

  const parts: string[] = [];
  const walk = (node: any): void => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.text === 'string') parts.push(node.text);
    if (node.elements) walk(node.elements);
  };
  walk(message.blocks);

  if (parts.length === 0 && Array.isArray(message.attachments)) {
    for (const att of message.attachments) {
      if (typeof att.text === 'string') parts.push(att.text);
      if (typeof att.fallback === 'string') parts.push(att.fallback);
    }
  }
  return parts.join(' ').trim();
}

export function registerShortcuts(app: App): void {

  // "Analyze with Syncraft"
  app.shortcut('analyze_message', async ({ shortcut, ack, client }) => {
    await ack();

    const message = (shortcut as any).message;
    const messageText = extractMessageText(message);
    const targetUserId: string = message?.user ?? '';
    const triggerId: string = shortcut.trigger_id;
    if (!messageText) console.log('[analyze_message] empty text, payload:', JSON.stringify(message));

    if (!messageText) {
      await client.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'Syncraft — Error' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [{
            type: 'section',
            text: { type: 'mrkdwn', text: 'No message text found to analyze.' },
          }],
        },
      });
      return;
    }

    const intent = classifyIntent(messageText);
    const targetProfile = targetUserId ? getProfile(targetUserId) : null;
    let availability;
    let replyEstimate;
    if (targetProfile) {
      availability = getAvailability(targetProfile);
      replyEstimate = getReplyEstimate(availability.status, targetProfile.responseSpeed);
    }

    await client.views.open({
      trigger_id: triggerId,
      view: buildAnalysisModal(messageText, intent, targetProfile, availability, replyEstimate),
    });
  });

  // "Suggest Reply with Syncraft"
  app.shortcut('suggest_reply', async ({ shortcut, ack, client }) => {
    await ack();

    const message = (shortcut as any).message;
    const messageText = extractMessageText(message);
    const senderId: string = message?.user ?? '';
    const requesterId: string = shortcut.user.id;
    const channelId: string = (shortcut as any).channel?.id ?? '';
    const threadTs: string | null = message?.thread_ts ?? null;

    if (!messageText) {
      console.log('[suggest_reply] empty text, payload:', JSON.stringify(message));
      // No content to suggest from — post a small ephemeral note instead of a modal
      if (channelId) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: requesterId,
          thread_ts: threadTs ?? undefined,
          text: 'No message text found to suggest replies for.',
        }).catch(() => { /* ignore */ });
      }
      return;
    }

    await postSuggestionChips({
      client,
      channelId,
      threadTs,
      requesterId,
      senderId,
      messageText,
    });
  });

  // Chip click → swap to copy-and-paste view
  for (let i = 0; i <= 2; i++) {
    app.action(`chip_select_${i}`, async ({ ack, action, respond }) => {
      await ack();
      try {
        const value = JSON.parse((action as any).value ?? '{}');
        const fullText: string = value.fullText ?? '';
        const cachedState: string = value.cachedState ?? '{}';
        await respond({
          replace_original: true,
          text: 'Copy and paste',
          blocks: buildCopySwapBlocks(fullText, cachedState),
        });
      } catch (err) {
        console.warn(`[chip_select_${i}] failed:`, err);
      }
    });
  }

  // Back → restore the chip view from cached state
  app.action('chip_back', async ({ ack, action, respond }) => {
    await ack();
    try {
      const cached = JSON.parse((action as any).value ?? '{}');
      const blocks = buildSuggestionChipsBlocks(
        cached.suggestions ?? [],
        cached.contextLine ?? null,
        cached.senderName ?? '',
      );
      await respond({
        replace_original: true,
        text: 'Suggested replies',
        blocks,
      });
    } catch (err) {
      console.warn('[chip_back] failed:', err);
    }
  });

  // Dismiss → delete the ephemeral
  app.action('chip_dismiss', async ({ ack, respond }) => {
    await ack();
    try {
      await respond({ delete_original: true });
    } catch (err) {
      console.warn('[chip_dismiss] failed:', err);
    }
  });
}
