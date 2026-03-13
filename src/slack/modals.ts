import { App } from '@slack/bolt';
import { getProfile, upsertProfile } from '../db/profileRepo';
import { getUserTraits, deleteUserData } from '../db/commTraitsRepo';
import { aggregateUserTraits } from '../services/traitAggregator';
import { buildEditProfileModal } from './blocks';
import { refreshAppHome } from './appHome';
import { isValidTimezone } from '../utils/time';
import { XiamiProfile } from '../types';

export function registerModals(app: App): void {

  // Open edit profile modal
  app.action('open_edit_profile_modal', async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const existingProfile = getProfile(userId);
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: buildEditProfileModal(existingProfile),
    });
  });

  // Handle profile submission
  app.view('edit_profile_submit', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const values = view.state.values;

    const timezone = values.timezone_block?.timezone_input?.selected_option?.value ?? 'America/Los_Angeles';
    const workStart = values.work_start_block?.work_start_input?.selected_time ?? '09:00';
    const workEnd = values.work_end_block?.work_end_input?.selected_time ?? '17:00';
    const sleepStart = values.sleep_start_block?.sleep_start_input?.selected_time ?? '23:00';
    const sleepEnd = values.sleep_end_block?.sleep_end_input?.selected_time ?? '07:00';
    const role = values.role_block?.role_input?.value ?? '';
    const responseSpeed = (values.speed_block?.speed_input?.selected_option?.value ?? 'medium') as XiamiProfile['responseSpeed'];

    // Validate timezone
    const validTz = isValidTimezone(timezone) ? timezone : 'UTC';
    if (!isValidTimezone(timezone)) {
      console.warn(`Invalid timezone submitted: ${timezone}, falling back to UTC`);
    }

    // Fetch display name from Slack
    let displayName = '';
    try {
      const info = await client.users.info({ user: userId });
      displayName = (info.user as any)?.profile?.display_name || (info.user as any)?.real_name || '';
    } catch (e) {
      // ignore
    }

    const profile: XiamiProfile = {
      slackUserId: userId,
      displayName,
      timezone: validTz,
      workStart,
      workEnd,
      sleepStart,
      sleepEnd,
      role: role ?? '',
      responseSpeed,
      sharingEnabled: true,
    };

    upsertProfile(profile);
    await refreshAppHome(client, userId);
  });

  // Clear my data
  app.action('clear_my_data', async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    deleteUserData(userId);
    await refreshAppHome(client, userId);
    await client.chat.postEphemeral({
      channel: (body as any).channel?.id ?? userId,
      user: userId,
      text: 'All communication data cleared. Your profile is unchanged.',
    }).catch(() => {
      // If channel not available (e.g. App Home), silently ignore
    });
  });

  // Refresh traits
  app.action('refresh_traits', async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    try {
      aggregateUserTraits(userId);
    } catch (e) {
      console.warn('Error aggregating traits:', e);
    }
    await refreshAppHome(client, userId);
  });
}
