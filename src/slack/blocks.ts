import type { KnownBlock, ActionsBlock } from '@slack/types';
// ModalView type for Slack modal definitions
type ModalView = {
  type: 'modal';
  callback_id?: string;
  title: { type: 'plain_text'; text: string; emoji?: boolean };
  submit?: { type: 'plain_text'; text: string; emoji?: boolean };
  close?: { type: 'plain_text'; text: string; emoji?: boolean };
  blocks: KnownBlock[];
};
import { SyncraftProfile, AvailabilityResult, UserCommTraits, IntentResult, ReplySuggestion } from '../types';

// ── Availability Blocks ──────────────────────────────────────────────────────

export function buildAvailabilityBlocks(
  profile: SyncraftProfile,
  availability: AvailabilityResult,
  replyEstimate: string,
  traits?: UserCommTraits | null,
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*📍 <@${profile.slackUserId}>*` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Role:*\n${profile.role || 'Not set'}` },
        { type: 'mrkdwn', text: `*Local Time:*\n${availability.localTimeString}` },
        { type: 'mrkdwn', text: `*Status:*\n${availability.statusLabel}` },
        { type: 'mrkdwn', text: `*Expected Reply:*\n${replyEstimate}` },
      ],
    },
  ];

  if (traits && traits.messagesSampled >= 10) {
    const styleParts: string[] = [];
    if (traits.lengthBucket === 'terse') styleParts.push('concise');
    else if (traits.lengthBucket === 'verbose') styleParts.push('detailed');
    if (traits.formality !== 'mixed') styleParts.push(traits.formality);
    const styleLabel = styleParts.length ? styleParts.join(' & ') : 'moderate';

    const fields: KnownBlock[] = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*🧠 Communication Style*' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Message style:*\n${styleLabel}` },
          { type: 'mrkdwn', text: `*Prefers threads:*\n${traits.prefersThreads ? 'Yes' : 'No'}` },
          { type: 'mrkdwn', text: `*Avg reply time:*\n~${Math.round(traits.avgResponseTimeMin)} min` },
          { type: 'mrkdwn', text: `*Uses emoji:*\n${traits.usesEmoji ? 'Yes' : 'No'}` },
        ],
      },
    ];

    if (traits.statedPreferences.length > 0) {
      fields.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Noted:* "${traits.statedPreferences[0]}"` },
      });
    }

    blocks.push({ type: 'divider' });
    blocks.push(...fields);
  }

  const tipText = buildTip(profile, availability);
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `💡 ${tipText}` }],
  });

  return blocks;
}

function buildTip(profile: SyncraftProfile, availability: AvailabilityResult): string {
  switch (availability.status) {
    case 'likely_asleep':
      return `Consider sending during their work hours (${profile.workStart} – ${profile.workEnd} ${profile.timezone}).`;
    case 'outside_work_hours':
      return "They're outside work hours but may check messages occasionally.";
    case 'available':
      return "They're in work hours. Good time to reach out.";
  }
}

// ── App Home Blocks ──────────────────────────────────────────────────────────

export function buildAppHomeBlocks(
  profile: SyncraftProfile | null,
  selfAvailability?: AvailabilityResult,
  selfReplyEstimate?: string,
  traits?: UserCommTraits | null,
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '👋 Welcome to Syncraft', emoji: true },
    },
  ];

  if (!profile) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: "Syncraft helps you communicate better with your teammates. Set up your profile to get started." },
    });
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Set Up Profile', emoji: true },
        action_id: 'open_edit_profile_modal',
        style: 'primary',
      }],
      block_id: 'edit_profile_btn',
    });
    return blocks;
  }

  // Profile section
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*Your Profile*' },
  });
  blocks.push({
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: `*Timezone:*\n${profile.timezone}` },
      { type: 'mrkdwn', text: `*Work Hours:*\n${profile.workStart} – ${profile.workEnd}` },
      { type: 'mrkdwn', text: `*Sleep Hours:*\n${profile.sleepStart} – ${profile.sleepEnd}` },
      { type: 'mrkdwn', text: `*Role:*\n${profile.role || 'Not set'}` },
      { type: 'mrkdwn', text: `*Response Speed:*\n${profile.responseSpeed}` },
      { type: 'mrkdwn', text: `*Sharing:*\n${profile.sharingEnabled ? 'Enabled' : 'Disabled'}` },
    ],
  });
  blocks.push({
    type: 'actions',
    elements: [{
      type: 'button',
      text: { type: 'plain_text', text: '✏️ Edit Profile', emoji: true },
      action_id: 'open_edit_profile_modal',
    }],
    block_id: 'edit_profile_btn',
  });

  // Current availability
  if (selfAvailability && selfReplyEstimate) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*👀 What others see right now*' },
    });
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Local Time:*\n${selfAvailability.localTimeString}` },
        { type: 'mrkdwn', text: `*Status:*\n${selfAvailability.statusLabel}` },
        { type: 'mrkdwn', text: `*Expected Reply:*\n${selfReplyEstimate}` },
      ],
    });
  }

  // Communication style
  blocks.push({ type: 'divider' });
  if (!traits || traits.messagesSampled < 10) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: "*🧠 Your Communication Style*\nStill learning your communication style... Keep chatting in public channels." },
    });
  } else {
    blocks.push(...buildTraitDisplayBlocks(traits));
  }

  // Privacy actions
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '🔄 Refresh Traits', emoji: true },
        action_id: 'refresh_traits',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '🗑️ Clear My Data', emoji: true },
        action_id: 'clear_my_data',
        style: 'danger',
      },
    ],
    block_id: 'clear_data_btn',
  });

  // Privacy footer
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: 'ℹ️ Syncraft only observes public channels. No message text is stored — only patterns like length and timing.',
    }],
  });

  return blocks;
}

// ── Trait Display Blocks ──────────────────────────────────────────────────────

export function buildTraitDisplayBlocks(traits: UserCommTraits): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*🧠 Your Communication Style*\nBased on ${traits.messagesSampled} messages observed` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Avg length:*\n~${Math.round(traits.avgMessageLength)} words (${traits.lengthBucket})` },
        { type: 'mrkdwn', text: `*Formality:*\n${capitalize(traits.formality)}` },
        { type: 'mrkdwn', text: `*Uses emoji:*\n${traits.usesEmoji ? 'Yes' : 'No'}` },
        { type: 'mrkdwn', text: `*Uses greetings:*\n${traits.usesGreetings ? 'Yes' : 'No'}` },
        { type: 'mrkdwn', text: `*Prefers threads:*\n${traits.prefersThreads ? 'Yes' : 'No'}` },
        { type: 'mrkdwn', text: `*Avg reply time:*\n~${Math.round(traits.avgResponseTimeMin)} min` },
        { type: 'mrkdwn', text: `*Meeting style:*\n${formatMeetingStyle(traits.typicalMeetingRequestStyle)}` },
        { type: 'mrkdwn', text: `*Peak hours:*\n${traits.peakActiveHoursLocal.join(', ') || 'Unknown'}` },
      ],
    },
  ];

  if (traits.statedPreferences.length > 0) {
    const prefList = traits.statedPreferences.map(p => `• "${p}"`).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Noted preferences:*\n${prefList}` },
    });
  }

  return blocks;
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Istanbul', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok',
  'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland',
];

export function buildEditProfileModal(existingProfile?: SyncraftProfile | null): ModalView {
  return {
    type: 'modal',
    callback_id: 'edit_profile_submit',
    title: { type: 'plain_text', text: 'Edit Profile', emoji: true },
    submit: { type: 'plain_text', text: 'Save', emoji: true },
    close: { type: 'plain_text', text: 'Cancel', emoji: true },
    blocks: [
      {
        type: 'input',
        block_id: 'timezone_block',
        label: { type: 'plain_text', text: 'Timezone' },
        element: {
          type: 'static_select',
          action_id: 'timezone_input',
          placeholder: { type: 'plain_text', text: 'Select timezone' },
          initial_option: existingProfile ? {
            text: { type: 'plain_text', text: existingProfile.timezone },
            value: existingProfile.timezone,
          } : undefined,
          options: TIMEZONE_OPTIONS.map(tz => ({
            text: { type: 'plain_text', text: tz },
            value: tz,
          })),
        },
      },
      {
        type: 'input',
        block_id: 'work_start_block',
        label: { type: 'plain_text', text: 'Work Start' },
        element: {
          type: 'timepicker',
          action_id: 'work_start_input',
          initial_time: existingProfile?.workStart ?? '09:00',
        },
      },
      {
        type: 'input',
        block_id: 'work_end_block',
        label: { type: 'plain_text', text: 'Work End' },
        element: {
          type: 'timepicker',
          action_id: 'work_end_input',
          initial_time: existingProfile?.workEnd ?? '17:00',
        },
      },
      {
        type: 'input',
        block_id: 'sleep_start_block',
        label: { type: 'plain_text', text: 'Sleep Start' },
        element: {
          type: 'timepicker',
          action_id: 'sleep_start_input',
          initial_time: existingProfile?.sleepStart ?? '23:00',
        },
      },
      {
        type: 'input',
        block_id: 'sleep_end_block',
        label: { type: 'plain_text', text: 'Sleep End' },
        element: {
          type: 'timepicker',
          action_id: 'sleep_end_input',
          initial_time: existingProfile?.sleepEnd ?? '07:00',
        },
      },
      {
        type: 'input',
        block_id: 'role_block',
        label: { type: 'plain_text', text: 'Role' },
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'role_input',
          placeholder: { type: 'plain_text', text: 'e.g. Engineer, Designer, PM' },
          initial_value: existingProfile?.role ?? '',
          max_length: 50,
        },
      },
      {
        type: 'input',
        block_id: 'speed_block',
        label: { type: 'plain_text', text: 'Response Speed' },
        element: {
          type: 'static_select',
          action_id: 'speed_input',
          initial_option: existingProfile ? {
            text: { type: 'plain_text', text: capitalize(existingProfile.responseSpeed) },
            value: existingProfile.responseSpeed,
          } : undefined,
          options: [
            { text: { type: 'plain_text', text: 'Fast' }, value: 'fast' },
            { text: { type: 'plain_text', text: 'Medium' }, value: 'medium' },
            { text: { type: 'plain_text', text: 'Slow' }, value: 'slow' },
          ],
        },
      },
    ],
  };
}

// ── Analysis Modal ────────────────────────────────────────────────────────────

export function buildAnalysisModal(
  messageText: string,
  intent: IntentResult,
  targetProfile?: SyncraftProfile | null,
  availability?: AvailabilityResult,
  replyEstimate?: string,
): ModalView {
  const preview = messageText.length > 200 ? messageText.slice(0, 200) + '…' : messageText;

  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*📝 Message Preview*' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${preview}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*🔍 Detected Intent*\n*${intent.label}*\n${intent.suggestion}` },
    },
  ];

  if (targetProfile && availability && replyEstimate) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*📍 Recipient Context*' },
    });
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Local Time:*\n${availability.localTimeString}` },
        { type: 'mrkdwn', text: `*Status:*\n${availability.statusLabel}` },
        { type: 'mrkdwn', text: `*Expected Reply:*\n${replyEstimate}` },
      ],
    });
  } else if (!targetProfile) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'No Syncraft profile found for the message author.' }],
    });
  }

  return {
    type: 'modal',
    title: { type: 'plain_text', text: 'Message Analysis', emoji: true },
    close: { type: 'plain_text', text: 'Close', emoji: true },
    blocks,
  };
}

// ── Suggestion Chips Blocks ───────────────────────────────────────────────────

export function buildSuggestionChipsBlocks(
  suggestions: ReplySuggestion[],
  contextLine: string | null,
  senderName: string,
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  if (contextLine) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: contextLine }],
    });
  }

  const cachedState = JSON.stringify({
    suggestions: suggestions.map(({ label, body }) => ({ label, body })),
    contextLine,
    senderName,
  });

  const chipElements: ActionsBlock['elements'] = suggestions.map((s, i) => {
    const fullText = s.body;
    const truncated = fullText.length > 75 ? fullText.slice(0, 74) + '…' : fullText;
    return {
      type: 'button',
      action_id: `chip_select_${i}`,
      text: { type: 'plain_text', text: truncated, emoji: true },
      value: JSON.stringify({ fullText, cachedState }),
    };
  });

  chipElements.push({
    type: 'button',
    action_id: 'chip_dismiss',
    text: { type: 'plain_text', text: '✕ Dismiss', emoji: true },
    value: '{}',
  });

  blocks.push({
    type: 'actions',
    elements: chipElements,
  });

  return blocks;
}

// ── Copy-Swap Blocks ──────────────────────────────────────────────────────────

/** Renders the post-click copy view. Triple-backtick runs in `chosenText` are stripped to keep the Slack code fence intact. */
export function buildCopySwapBlocks(
  chosenText: string,
  cachedState: string,
): KnownBlock[] {
  const safeText = chosenText.replace(/`{3,}/g, '');
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '📋 *Copy and paste:*' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '```\n' + safeText + '\n```' },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'chip_back',
          text: { type: 'plain_text', text: '← Back to suggestions', emoji: true },
          value: cachedState,
        },
        {
          type: 'button',
          action_id: 'chip_dismiss',
          text: { type: 'plain_text', text: '✕ Dismiss', emoji: true },
          value: '{}',
        },
      ],
    },
  ];
}

// ── Suggestion Modal ──────────────────────────────────────────────────────────

export function buildSuggestionModal(
  messageText: string,
  senderName: string,
  suggestions: ReplySuggestion[],
  contextSummary: string[],
): ModalView {
  const preview = messageText.length > 150 ? messageText.slice(0, 150) + '…' : messageText;

  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*📝 Replying to:*\n> ${preview}\nfrom @${senderName}` },
    },
  ];

  if (contextSummary.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*📊 Context*\n${contextSummary.map(c => `• ${c}`).join('\n')}` },
    });
  }

  suggestions.forEach((s, i) => {
    const idx = i + 1;
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*💡 Suggestion ${idx}: ${s.label}*\n\`\`\`${s.body}\`\`\`\n_Why: ${s.reasoning}_` },
    });
    blocks.push({
      type: 'actions',
      block_id: `suggestion_${idx}`,
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '📋 Copy', emoji: true },
        action_id: `copy_suggestion_${idx}`,
        value: s.body,
      }],
    });
  });

  return {
    type: 'modal',
    title: { type: 'plain_text', text: 'Suggested Replies', emoji: true },
    close: { type: 'plain_text', text: 'Close', emoji: true },
    blocks,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMeetingStyle(style: string): string {
  switch (style) {
    case 'proposes_specific_time': return 'Proposes specific times';
    case 'asks_for_availability': return 'Asks for availability';
    case 'defers_to_other': return 'Defers to others';
    default: return 'Unknown';
  }
}
