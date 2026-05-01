import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickContextLine } from '../src/slack/chips';
import type { SuggestionContext, ReplySuggestion, UserCommTraits, PairCommTraits } from '../src/types';

const baseTraits: UserCommTraits = {
  slackUserId: 'U_SENDER',
  avgMessageLength: 20,
  lengthBucket: 'moderate',
  usesGreetings: false,
  usesSignoffs: false,
  usesEmoji: false,
  formality: 'mixed',
  peakActiveHoursLocal: [],
  avgResponseTimeMin: 0,
  respondsOnWeekends: false,
  topIntentsSent: [],
  topIntentsReceived: [],
  asksClarifyingQuestions: false,
  prefersThreads: false,
  typicalMeetingRequestStyle: 'unknown',
  preferredMeetingTimes: [],
  statedPreferences: [],
  messagesSampled: 30,
  lastUpdated: new Date().toISOString(),
};

function makeContext(overrides: Partial<SuggestionContext> = {}): SuggestionContext {
  return {
    messageText: 'hello',
    senderId: 'U_SENDER',
    requesterId: 'U_ME',
    senderProfile: null,
    senderTraits: baseTraits,
    requesterTraits: null,
    pairTraits: null,
    teamTraits: null,
    intent: { intent: 'general', label: 'General', suggestion: '' },
    isUrgent: false,
    ...overrides,
  };
}

const dummySuggestions: ReplySuggestion[] = [
  { label: 'Acknowledge', body: 'Got it, thanks.', reasoning: '' },
];

describe('pickContextLine', () => {
  it('rule 1: shows stated preference when sender has one', () => {
    const ctx = makeContext({
      senderTraits: { ...baseTraits, statedPreferences: ['please keep replies short'] },
    });
    const line = pickContextLine(dummySuggestions, ctx, 'Kevin');
    assert.equal(line, '💡 Kevin has said: "please keep replies short"');
  });

  it('rule 2: shows urgency line when isUrgent and no stated preference', () => {
    const ctx = makeContext({ isUrgent: true });
    const line = pickContextLine(dummySuggestions, ctx, 'Kevin');
    assert.equal(line, '⚡ Looks urgent — a quick ack now is better than a long reply later');
  });

  it('rule 3: shows pair-friction line when median reply time > 120 min', () => {
    const pair: PairCommTraits = {
      userA: 'U_ME', userB: 'U_SENDER',
      totalInteractions: 10,
      avgResponseTimeAtoBMin: 180, avgResponseTimeBtoAMin: 30,
      dominantRequester: null,
      dominantIntentAtoB: 'general', dominantIntentBtoA: 'general',
      formalityMatch: false, lengthMatch: false,
      commonTopics: [], lastInteraction: '',
      messagesSampled: 10, lastUpdated: '',
    };
    const ctx = makeContext({ pairTraits: pair });
    const line = pickContextLine(dummySuggestions, ctx, 'Kevin');
    assert.equal(line, '⏱ You usually reply to Kevin in 2+ hours — a fast ack helps');
  });

  it('rule 4: shows status-check line when "Proactive update" suggestion is present', () => {
    const suggestions: ReplySuggestion[] = [
      { label: 'Give a range', body: '...', reasoning: '' },
      { label: 'Proactive update', body: '...', reasoning: '' },
    ];
    const ctx = makeContext();
    const line = pickContextLine(suggestions, ctx, 'Kevin');
    assert.equal(line, '📊 Kevin often follows up for status — a proactive update can prevent the next ping');
  });

  it('returns null when no rule matches', () => {
    const ctx = makeContext();
    const line = pickContextLine(dummySuggestions, ctx, 'Kevin');
    assert.equal(line, null);
  });

  it('priority: stated preference beats urgency', () => {
    const ctx = makeContext({
      isUrgent: true,
      senderTraits: { ...baseTraits, statedPreferences: ['short replies please'] },
    });
    const line = pickContextLine(dummySuggestions, ctx, 'Kevin');
    assert.equal(line, '💡 Kevin has said: "short replies please"');
  });
});
