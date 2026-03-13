import { App } from '@slack/bolt';
import { getProfile } from '../db/profileRepo';
import { getUserTraits } from '../db/commTraitsRepo';
import { getAvailability } from '../services/availabilityService';
import { getReplyEstimate } from '../services/replyEstimateService';
import { buildAppHomeBlocks } from './blocks';

export function registerAppHome(app: App): void {
  app.event('app_home_opened', async ({ event, client }) => {
    const userId = event.user;
    const profile = getProfile(userId);
    const traits = getUserTraits(userId);

    let selfAvailability;
    let selfReplyEstimate;
    if (profile) {
      selfAvailability = getAvailability(profile);
      selfReplyEstimate = getReplyEstimate(selfAvailability.status, profile.responseSpeed);
    }

    await client.views.publish({
      user_id: userId,
      view: {
        type: 'home',
        blocks: buildAppHomeBlocks(profile, selfAvailability, selfReplyEstimate, traits),
      },
    });
  });
}

export async function refreshAppHome(client: any, userId: string): Promise<void> {
  const profile = getProfile(userId);
  const traits = getUserTraits(userId);

  let selfAvailability;
  let selfReplyEstimate;
  if (profile) {
    selfAvailability = getAvailability(profile);
    selfReplyEstimate = getReplyEstimate(selfAvailability.status, profile.responseSpeed);
  }

  await client.views.publish({
    user_id: userId,
    view: {
      type: 'home',
      blocks: buildAppHomeBlocks(profile, selfAvailability, selfReplyEstimate, traits),
    },
  });
}
