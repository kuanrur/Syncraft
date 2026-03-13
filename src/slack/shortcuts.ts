import { App } from '@slack/bolt';
import { getProfile } from '../db/profileRepo';
import { getAvailability } from '../services/availabilityService';
import { getReplyEstimate } from '../services/replyEstimateService';
import { classifyIntent } from '../services/intentClassifier';
import { buildAnalysisModal } from './blocks';
import { openSuggestionModal } from './commands';

export function registerShortcuts(app: App): void {

  // "Analyze with Xiami"
  app.shortcut('analyze_message', async ({ shortcut, ack, client }) => {
    await ack();

    const message = (shortcut as any).message;
    const messageText: string = message?.text ?? '';
    const targetUserId: string = message?.user ?? '';
    const triggerId: string = shortcut.trigger_id;

    if (!messageText) {
      await client.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'Xiami — Error' },
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

  // "Suggest Reply with Xiami"
  app.shortcut('suggest_reply', async ({ shortcut, ack, client }) => {
    await ack();

    const message = (shortcut as any).message;
    const messageText: string = message?.text ?? '';
    const senderId: string = message?.user ?? '';
    const requesterId: string = shortcut.user.id;
    const triggerId: string = shortcut.trigger_id;

    if (!messageText) {
      await client.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'Xiami — Error' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [{
            type: 'section',
            text: { type: 'mrkdwn', text: 'No message text found to analyze.' },
          }],
        },
      });
      return;
    }

    await openSuggestionModal({ client, triggerId, messageText, senderId, requesterId });
  });

  // Copy suggestion actions
  for (let i = 1; i <= 3; i++) {
    app.action(`copy_suggestion_${i}`, async ({ ack, body, action, client }) => {
      await ack();
      const suggestionText = (action as any).value ?? '';
      const userId = body.user.id;
      const channelId = (body as any).channel?.id;

      if (channelId) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: suggestionText,
        }).catch(err => console.warn('Copy action ephemeral failed:', err));
      }
    });
  }
}
