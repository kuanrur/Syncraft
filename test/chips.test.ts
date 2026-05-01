import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickContextLine } from '../src/slack/chips';
import { buildSuggestionChipsBlocks, buildCopySwapBlocks } from '../src/slack/blocks';
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

  it('rule 3: shows pair-friction line when avg reply time > 120 min', () => {
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

describe('buildSuggestionChipsBlocks', () => {
  const suggestions: ReplySuggestion[] = [
    { label: 'Acknowledge', body: 'Got it, thanks.', reasoning: '' },
    { label: 'Acknowledge + next step', body: "Thanks — I'll follow up.", reasoning: '' },
  ];

  it('renders one section per suggestion with a Use-this accessory button, plus a Dismiss actions block', () => {
    const blocks = buildSuggestionChipsBlocks(suggestions, null, 'Kevin');
    const sections = blocks.filter((b: any) => b.type === 'section') as any[];
    assert.equal(sections.length, 2);
    assert.equal(sections[0].text.text, '> Got it, thanks.');
    assert.equal(sections[0].accessory.action_id, 'chip_select_0');
    assert.equal(sections[0].accessory.text.text, 'Use this');
    assert.equal(sections[1].text.text, "> Thanks — I'll follow up.");
    assert.equal(sections[1].accessory.action_id, 'chip_select_1');

    const actions = blocks.find((b: any) => b.type === 'actions') as any;
    assert.equal(actions.elements.length, 1);
    assert.equal(actions.elements[0].action_id, 'chip_dismiss');
  });

  it('omits the context block when contextLine is null', () => {
    const blocks = buildSuggestionChipsBlocks(suggestions, null, 'Kevin');
    const contextBlocks = blocks.filter((b: any) => b.type === 'context');
    assert.equal(contextBlocks.length, 0);
  });

  it('renders the context line as a context block when provided', () => {
    const blocks = buildSuggestionChipsBlocks(suggestions, '⚡ Looks urgent', 'Kevin');
    const ctx = blocks.find((b: any) => b.type === 'context') as any;
    assert.ok(ctx, 'context block exists');
    assert.match(ctx.elements[0].text, /Looks urgent/);
  });

  it('returns a single actions block with only Dismiss when suggestions is empty', () => {
    const blocks = buildSuggestionChipsBlocks([], null, 'Kevin');
    const actions = blocks.find((b: any) => b.type === 'actions') as any;
    assert.ok(actions);
    assert.equal(actions.elements.length, 1);
    assert.equal(actions.elements[0].action_id, 'chip_dismiss');
  });

  it('renders long suggestions in full without truncation, mirrored in the button value', () => {
    const long = 'x'.repeat(200);
    const blocks = buildSuggestionChipsBlocks(
      [{ label: 'Long', body: long, reasoning: '' }],
      null,
      'Kevin',
    );
    const section = blocks.find((b: any) => b.type === 'section') as any;
    assert.equal(section.text.text, `> ${long}`);
    const value = JSON.parse(section.accessory.value);
    assert.equal(value.fullText, long);
  });
});

describe('buildCopySwapBlocks', () => {
  it('renders the chosen text in a fenced code block', () => {
    const blocks = buildCopySwapBlocks('Got it, thanks.', '{"cachedState":"x"}');
    const sectionWithCode = blocks.find(
      (b: any) => b.type === 'section' && typeof b.text?.text === 'string' && b.text.text.includes('```'),
    ) as any;
    assert.ok(sectionWithCode, 'a section block containing a code fence exists');
    assert.match(sectionWithCode.text.text, /```\nGot it, thanks\.\n```/);
  });

  it('renders Back and Dismiss buttons', () => {
    const blocks = buildCopySwapBlocks('Got it, thanks.', '{"cachedState":"x"}');
    const actions = blocks.find((b: any) => b.type === 'actions') as any;
    const ids = actions.elements.map((e: any) => e.action_id);
    assert.deepEqual(ids, ['chip_back', 'chip_dismiss']);
  });

  it('back button carries the cached state in value', () => {
    const cached = JSON.stringify({ suggestions: [], contextLine: null, senderName: 'Kevin' });
    const blocks = buildCopySwapBlocks('Got it, thanks.', cached);
    const actions = blocks.find((b: any) => b.type === 'actions') as any;
    const back = actions.elements.find((e: any) => e.action_id === 'chip_back');
    assert.equal(back.value, cached);
  });

  it('strips triple-backtick runs from chosenText so the code fence is not broken', () => {
    const blocks = buildCopySwapBlocks('plain ``` injection ``` here', '{}');
    const sectionWithCode = blocks.find(
      (b: any) => b.type === 'section' && typeof b.text?.text === 'string' && b.text.text.includes('```\n'),
    ) as any;
    assert.ok(sectionWithCode);
    // The injection backticks were stripped — only the outer fence remains
    const fenceCount = (sectionWithCode.text.text.match(/```/g) ?? []).length;
    assert.equal(fenceCount, 2, 'expected exactly the opening and closing fences');
  });
});
