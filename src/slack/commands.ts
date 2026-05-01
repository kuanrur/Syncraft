import { App } from '@slack/bolt';
import { getProfile } from '../db/profileRepo';
import { getUserTraits } from '../db/commTraitsRepo';
import { getAvailability } from '../services/availabilityService';
import { getReplyEstimate } from '../services/replyEstimateService';
import { buildAvailabilityBlocks } from './blocks';
import { postSuggestionChips } from './chips';

export function registerCommand(app: App): void {
  app.command('/syncraft', async ({ command, ack, respond, client, body }) => {
    await ack();

    const text = (command.text ?? '').trim();
    console.log('[/syncraft] received text:', JSON.stringify(text));

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
            console.log('[/syncraft] looking for:', username);
            console.log('[/syncraft] available members:', members.filter(m => !m.is_bot && !m.deleted).map((m: any) => ({
              id: m.id, name: m.name, display: m.profile?.display_name, real: m.real_name
            })));
          }
        } catch (e) {
          console.warn('[/syncraft] users.list failed:', e);
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
        console.log('[/syncraft] user fields:', JSON.stringify({
          name: u?.name,
          real_name: u?.real_name,
          display_name: u?.profile?.display_name,
          display_name_normalized: u?.profile?.display_name_normalized,
        }));
        targetName = u?.profile?.display_name_normalized || u?.profile?.display_name || u?.real_name || u?.name || targetUserId;
      } catch (e) {
        console.warn('[/syncraft] users.info error:', e);
      }

      const profile = getProfile(targetUserId);
      // Override displayName with freshly fetched name
      if (profile && targetName !== targetUserId) {
        profile.displayName = targetName;
      }
      if (!profile) {
        await respond({ response_type: 'ephemeral', text: 'No Syncraft profile found for this user yet.' });
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

    // Case 2: /syncraft reply
    if (text.toLowerCase().startsWith('reply')) {
      const threadTs = command.thread_ts ?? (body as any).thread_ts;
      if (!threadTs) {
        await respond({ response_type: 'ephemeral', text: 'Use `/syncraft reply` inside a thread to get suggestions.' });
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

      await postSuggestionChips({
        client,
        respond,
        channelId: command.channel_id,
        threadTs,
        requesterId: command.user_id,
        senderId,
        messageText: parentText,
      });
      return;
    }

    // Case 3: help
    await respond({
      response_type: 'ephemeral',
      text: 'Usage:\n• `/syncraft @someone` — Check availability\n• `/syncraft reply` — Get reply suggestions (use in a thread)',
    });
  });
}

