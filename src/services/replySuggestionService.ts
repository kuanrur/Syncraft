import { SuggestionContext, ReplySuggestion, UserCommTraits, LengthBucket, Formality } from '../types';

export function generateSuggestions(context: SuggestionContext): ReplySuggestion[] {
  const { intent, senderTraits, requesterTraits, pairTraits, teamTraits, isUrgent } = context;

  // Determine style params
  const style = determineStyle(senderTraits, requesterTraits, pairTraits);
  const senderName = context.senderProfile?.displayName || context.senderId;
  const thinData = !senderTraits || senderTraits.messagesSampled < 10;

  // Base suggestions per intent
  const suggestions = buildIntentSuggestions(intent.intent, style, senderName, senderTraits, thinData);

  // Apply pair-specific reasoning
  for (const s of suggestions) {
    if (pairTraits) {
      if (pairTraits.dominantRequester === context.senderId) {
        s.reasoning += ` ${senderName} usually initiates with you. Quick acknowledgment goes a long way.`;
      }
      const requesterIsA = context.requesterId <= context.senderId;
      const myResponseTime = requesterIsA ? pairTraits.avgResponseTimeAtoBMin : pairTraits.avgResponseTimeBtoAMin;
      if (myResponseTime > 120) {
        s.reasoning += ` You usually reply to ${senderName} in 2+ hours. If this is urgent, a quick ack now helps.`;
      }
    }

    if (senderTraits?.statedPreferences && senderTraits.statedPreferences.length > 0) {
      s.reasoning += ` Note: ${senderName} has said: "${senderTraits.statedPreferences[0]}"`;
    }

    if (isUrgent) {
      s.reasoning = `[URGENT] ${s.reasoning}`;
    }

    if (thinData) {
      s.reasoning += ` Still learning about ${senderName}'s style. Suggestions based on message intent only.`;
    }
  }

  return suggestions.slice(0, 3);
}

interface StyleParams {
  greeting: string;
  signoff: string;
  useEmoji: boolean;
  formality: Formality;
  lengthBucket: LengthBucket;
}

function determineStyle(
  senderTraits: UserCommTraits | null,
  requesterTraits: UserCommTraits | null,
  pairTraits: any,
): StyleParams {
  // Use sender's style, fall back to requester's, then defaults
  const base = senderTraits ?? requesterTraits;
  const formality: Formality = base?.formality ?? 'mixed';
  const lengthBucket: LengthBucket = base?.lengthBucket ?? 'moderate';
  const useEmoji = base?.usesEmoji ?? false;

  let greeting = '';
  let signoff = '';

  if (base?.usesGreetings || formality === 'formal') {
    greeting = formality === 'casual' ? 'Hey — ' : 'Hello — ';
  }
  if (base?.usesSignoffs) {
    signoff = formality === 'casual' ? ' Thanks!' : ' Best,';
  }

  return { greeting, signoff, useEmoji, formality, lengthBucket };
}

function buildIntentSuggestions(
  intent: string,
  style: StyleParams,
  senderName: string,
  senderTraits: UserCommTraits | null,
  thinData: boolean,
): ReplySuggestion[] {
  const { greeting, signoff } = style;
  const emo = style.useEmoji ? ' 👍' : '';
  const baseReasoning = thinData
    ? `Based on message intent only.`
    : `${senderName} tends to communicate in a ${style.formality} ${style.lengthBucket} style.`;

  switch (intent) {
    case 'eta_request':
      return [
        {
          label: 'Give a range',
          body: `${greeting}Looking at end of week. I'll update you if anything changes.${signoff}`,
          reasoning: `${baseReasoning} A range sets expectations without over-committing.`,
        },
        {
          label: 'Acknowledge + clarify scope',
          body: `${greeting}Working on it — do you need a rough ETA or a firm deadline?${signoff}`,
          reasoning: `${baseReasoning} ${senderTraits?.asksClarifyingQuestions ? `${senderName} frequently asks clarifying questions themselves; they'll appreciate the distinction.` : 'Clarifying scope prevents follow-ups.'}`,
        },
        ...(senderTraits?.topIntentsSent?.includes('status_check') ? [{
          label: 'Proactive update',
          body: `${greeting}Still in progress. Next milestone: review by Friday. I'll flag blockers.${signoff}`,
          reasoning: `${baseReasoning} ${senderName} often follows up for status. A proactive update may prevent the next check-in.`,
        }] : []),
      ];

    case 'status_check':
      return [
        {
          label: 'Quick status',
          body: `${greeting}On track. Working through final steps.${signoff}${emo}`,
          reasoning: `${baseReasoning} A direct status update matches their ask.`,
        },
        {
          label: 'Status + next step',
          body: `${greeting}On track. Next: final review by EOW. ETA: Friday.${signoff}`,
          reasoning: `${baseReasoning} Including next steps reduces follow-up messages.`,
        },
      ];

    case 'approval':
      return [
        {
          label: 'Approve with context',
          body: `${greeting}Yes, go ahead.${signoff}${emo}`,
          reasoning: `${baseReasoning} Clear approval unblocks them immediately.`,
        },
        {
          label: 'Approve with condition',
          body: `${greeting}Approved — just make sure to document the changes.${signoff}`,
          reasoning: `${baseReasoning} Adding one guardrail keeps things clear without slowing them down.`,
        },
        {
          label: 'Defer / need more info',
          body: `${greeting}Before I sign off, can you share more details on the scope?${signoff}`,
          reasoning: `${baseReasoning} If you need more info, getting it upfront saves a round-trip.`,
        },
      ];

    case 'clarification':
      return [
        {
          label: 'Concise explanation',
          body: `${greeting}It refers to [your explanation here].${signoff}`,
          reasoning: `${baseReasoning} A direct answer to a clarification request.`,
        },
        {
          label: 'Explain + offer more',
          body: `${greeting}[Brief explanation]. Happy to walk through it in more detail.${signoff}`,
          reasoning: `${baseReasoning} Offering more helps if they need deeper context.`,
        },
      ];

    default: // general
      return [
        {
          label: 'Acknowledge',
          body: `${greeting}Got it, thanks.${signoff}${emo}`,
          reasoning: `${baseReasoning} A clean acknowledgment closes the loop.`,
        },
        {
          label: 'Acknowledge + next step',
          body: `${greeting}Thanks — I'll follow up once I have an update.${signoff}`,
          reasoning: `${baseReasoning} Setting expectations on next steps reduces back-and-forth.`,
        },
      ];
  }
}
