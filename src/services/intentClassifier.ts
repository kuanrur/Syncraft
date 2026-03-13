import { IntentResult, IntentType } from '../types';

const INTENT_MAP: Array<{ intent: IntentType; label: string; keywords: string[]; suggestion: string }> = [
  {
    intent: 'eta_request',
    label: 'ETA / Deadline request',
    keywords: ['when will', 'eta', 'by when', 'timeline', 'deadline', 'how long', 'when can', 'when is', 'due date', 'finish', 'done by'],
    suggestion: 'This asks for a timeline. Consider specifying whether you want a rough estimate or a firm commitment.',
  },
  {
    intent: 'clarification',
    label: 'Clarification request',
    keywords: ['can you explain', 'what does this mean', 'clarify', 'help me understand', 'what do you mean', 'confused', 'unclear'],
    suggestion: 'This asks for clarification. Including what specifically is unclear may get a faster answer.',
  },
  {
    intent: 'approval',
    label: 'Approval request',
    keywords: ['can i proceed', 'approve', 'sign off', 'okay to move forward', 'go ahead', 'greenlight', 'thumbs up', 'permission'],
    suggestion: 'This requests approval. Stating what exactly needs sign-off and any deadline helps.',
  },
  {
    intent: 'status_check',
    label: 'Status check',
    keywords: ['any update', 'where are we', 'progress', 'status', 'how is', "how's it going", "what's the latest"],
    suggestion: 'This is a status check. Mentioning which aspect you care about most can focus the reply.',
  },
];

const GENERAL: IntentResult = {
  intent: 'general',
  label: 'General message',
  suggestion: 'General message. No specific optimization suggested.',
};

export function classifyIntent(text: string): IntentResult {
  const lower = text.toLowerCase();
  for (const entry of INTENT_MAP) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return { intent: entry.intent, label: entry.label, suggestion: entry.suggestion };
    }
  }
  return GENERAL;
}
