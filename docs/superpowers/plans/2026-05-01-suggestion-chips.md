# Suggestion Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Suggested Replies" Slack modal with an ephemeral, in-thread chip view that shows three reply suggestions as clickable buttons, with a single optional context line surfaced only when a non-generic signal applies.

**Architecture:** Suggest Reply becomes an ephemeral Block Kit message (`chat.postEphemeral`) instead of a `views.open` modal. Three button "chips" carry the suggestion text in their labels and full state (suggestions + context line + sender name) in their `value` payloads. Clicking a chip swaps the ephemeral in place via `response_url` + `replace_original: true` to a code-block "copy & paste" view with a Back button that restores the chip view from the cached state. The optional context line is computed by a new pure function that walks four priority rules and returns the first hit or `null`.

**Tech Stack:** TypeScript, `@slack/bolt` v4 (Socket Mode), Block Kit, `node:test` for unit tests, `tsx` runner.

**Spec:** [docs/superpowers/specs/2026-05-01-suggestion-chips-design.md](../specs/2026-05-01-suggestion-chips-design.md)

---

## File map

```
src/slack/chips.ts        [new]   postSuggestionChips() + pickContextLine()
src/slack/blocks.ts       [edit]  + buildSuggestionChipsBlocks(), + buildCopySwapBlocks(), – buildSuggestionModal()
src/slack/shortcuts.ts    [edit]  suggest_reply: call postSuggestionChips; +chip_select_0/1/2, chip_back, chip_dismiss; –copy_suggestion_*
src/slack/commands.ts     [edit]  /syncraft reply: call postSuggestionChips; –openSuggestionModal()
test/chips.test.ts        [new]   unit tests for pickContextLine + the two block builders
package.json              [edit]  add "test" script
```

---

## Task 1: Add `pickContextLine()` with unit tests

The whole "only show context when special" rule lives in this pure function. Building it first lets us nail the rule semantics under test before any Slack code depends on it.

**Files:**
- Create: `test/chips.test.ts`
- Create: `src/slack/chips.ts`
- Modify: `package.json` (add `"test"` script)

- [ ] **Step 1.1: Add a `test` script to `package.json`**

Open `/Users/kj/Documents/Syncraft/package.json` and add a `"test"` entry inside `"scripts"`:

```json
"scripts": {
  "dev": "npx tsx src/app.ts",
  "build": "tsc",
  "start": "node dist/app.js",
  "test": "node --import tsx --test test/**/*.test.ts"
}
```

- [ ] **Step 1.2: Write failing tests for `pickContextLine()`**

Create `/Users/kj/Documents/Syncraft/test/chips.test.ts`:

```typescript
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
```

- [ ] **Step 1.3: Run tests to verify they fail**

Run: `cd /Users/kj/Documents/Syncraft && npm test`
Expected: All `pickContextLine` tests fail with `Cannot find module '../src/slack/chips'` or similar.

- [ ] **Step 1.4: Create `src/slack/chips.ts` with `pickContextLine()`**

Create `/Users/kj/Documents/Syncraft/src/slack/chips.ts`:

```typescript
import type { SuggestionContext, ReplySuggestion } from '../types';

export function pickContextLine(
  suggestions: ReplySuggestion[],
  context: SuggestionContext,
  senderName: string,
): string | null {
  // Rule 1: stated preference
  const pref = context.senderTraits?.statedPreferences?.[0];
  if (pref) {
    return `💡 ${senderName} has said: "${pref}"`;
  }

  // Rule 2: urgency
  if (context.isUrgent) {
    return '⚡ Looks urgent — a quick ack now is better than a long reply later';
  }

  // Rule 3: pair-friction (median reply time > 120 min in the requester→sender direction)
  if (context.pairTraits) {
    const [a] = [context.requesterId, context.senderId].sort();
    const requesterIsA = context.requesterId === a;
    const myReplyTime = requesterIsA
      ? context.pairTraits.avgResponseTimeAtoBMin
      : context.pairTraits.avgResponseTimeBtoAMin;
    if (myReplyTime > 120) {
      return `⏱ You usually reply to ${senderName} in 2+ hours — a fast ack helps`;
    }
  }

  // Rule 4: status-check pattern (the unlocked "Proactive update" suggestion is present)
  if (suggestions.some(s => s.label === 'Proactive update')) {
    return `📊 ${senderName} often follows up for status — a proactive update can prevent the next ping`;
  }

  return null;
}
```

- [ ] **Step 1.5: Run tests to verify they pass**

Run: `cd /Users/kj/Documents/Syncraft && npm test`
Expected: All 6 `pickContextLine` tests pass.

- [ ] **Step 1.6: Commit**

```bash
git -C /Users/kj/Documents/Syncraft add package.json src/slack/chips.ts test/chips.test.ts
git -C /Users/kj/Documents/Syncraft commit -m "feat(slack): add pickContextLine for chip context

Pure function that walks the four priority rules and returns the first
matching context line, or null when no rule fires."
```

---

## Task 2: Add `buildSuggestionChipsBlocks()` block builder

This builds the Block Kit JSON for the initial chip view: optional context line + up to three button "chips" + a Dismiss button. Each chip's `value` carries the JSON-encoded full state so the click handlers can swap views without re-running suggestion generation.

**Files:**
- Modify: `src/slack/blocks.ts` (add new function)
- Modify: `test/chips.test.ts` (add tests)

- [ ] **Step 2.1: Add failing test for the chip blocks shape**

Append to `/Users/kj/Documents/Syncraft/test/chips.test.ts`:

```typescript
import { buildSuggestionChipsBlocks } from '../src/slack/blocks';

describe('buildSuggestionChipsBlocks', () => {
  const suggestions: ReplySuggestion[] = [
    { label: 'Acknowledge', body: 'Got it, thanks.', reasoning: '' },
    { label: 'Acknowledge + next step', body: "Thanks — I'll follow up.", reasoning: '' },
  ];

  it('renders a chip per suggestion plus a Dismiss button', () => {
    const blocks = buildSuggestionChipsBlocks(suggestions, null, 'Kevin');
    const actions = blocks.find((b: any) => b.type === 'actions') as any;
    assert.ok(actions, 'actions block exists');
    // 2 chip buttons + 1 dismiss button
    assert.equal(actions.elements.length, 3);
    assert.equal(actions.elements[0].action_id, 'chip_select_0');
    assert.equal(actions.elements[0].text.text, 'Got it, thanks.');
    assert.equal(actions.elements[1].action_id, 'chip_select_1');
    assert.equal(actions.elements[2].action_id, 'chip_dismiss');
  });

  it('omits the context section when contextLine is null', () => {
    const blocks = buildSuggestionChipsBlocks(suggestions, null, 'Kevin');
    const sections = blocks.filter((b: any) => b.type === 'section');
    assert.equal(sections.length, 0);
  });

  it('renders the context line as a context block when provided', () => {
    const blocks = buildSuggestionChipsBlocks(suggestions, '⚡ Looks urgent', 'Kevin');
    const ctx = blocks.find((b: any) => b.type === 'context') as any;
    assert.ok(ctx, 'context block exists');
    assert.match(ctx.elements[0].text, /Looks urgent/);
  });

  it('truncates chip label > 75 chars and stores full text in value', () => {
    const long = 'x'.repeat(120);
    const blocks = buildSuggestionChipsBlocks(
      [{ label: 'Long', body: long, reasoning: '' }],
      null,
      'Kevin',
    );
    const actions = blocks.find((b: any) => b.type === 'actions') as any;
    const chip = actions.elements[0];
    assert.ok(chip.text.text.length <= 75, `label is ${chip.text.text.length} chars`);
    assert.ok(chip.text.text.endsWith('…'));
    const value = JSON.parse(chip.value);
    assert.equal(value.fullText, long);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `cd /Users/kj/Documents/Syncraft && npm test`
Expected: New tests fail with `buildSuggestionChipsBlocks is not a function` (or import error).

- [ ] **Step 2.3: Implement `buildSuggestionChipsBlocks` in `src/slack/blocks.ts`**

Add this export to `/Users/kj/Documents/Syncraft/src/slack/blocks.ts` (place it near the existing modal builders, before the `export function buildSuggestionModal`):

```typescript
export function buildSuggestionChipsBlocks(
  suggestions: ReplySuggestion[],
  contextLine: string | null,
  senderName: string,
): any[] {
  const blocks: any[] = [];

  if (contextLine) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: contextLine }],
    });
  }

  const cachedState = JSON.stringify({
    suggestions,
    contextLine,
    senderName,
  });

  const chipElements = suggestions.map((s, i) => {
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
  } as any);

  blocks.push({
    type: 'actions',
    elements: chipElements,
  });

  return blocks;
}
```

Make sure `ReplySuggestion` is imported at the top of the file (it already is, given the existing modal builder uses it).

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `cd /Users/kj/Documents/Syncraft && npm test`
Expected: All `buildSuggestionChipsBlocks` tests pass.

- [ ] **Step 2.5: Commit**

```bash
git -C /Users/kj/Documents/Syncraft add src/slack/blocks.ts test/chips.test.ts
git -C /Users/kj/Documents/Syncraft commit -m "feat(slack): add buildSuggestionChipsBlocks

Renders the chip view: optional context line + one button per suggestion
+ dismiss. Each chip's value carries the cached state needed for the
back swap, and labels are truncated past Slack's 75-char limit."
```

---

## Task 3: Add `buildCopySwapBlocks()` block builder

Builds the post-click view: a Slack code block with the chosen reply text, plus a Back button that restores the chip view and a Dismiss button.

**Files:**
- Modify: `src/slack/blocks.ts` (add new function)
- Modify: `test/chips.test.ts` (add tests)

- [ ] **Step 3.1: Add failing test for the copy-swap blocks**

Append to `test/chips.test.ts`:

```typescript
import { buildCopySwapBlocks } from '../src/slack/blocks';

describe('buildCopySwapBlocks', () => {
  it('renders the chosen text in a fenced code block', () => {
    const blocks = buildCopySwapBlocks('Got it, thanks.', '{"cachedState":"x"}');
    const section = blocks.find((b: any) => b.type === 'section') as any;
    assert.ok(section, 'section block exists');
    assert.match(section.text.text, /```\nGot it, thanks\.\n```/);
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
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `cd /Users/kj/Documents/Syncraft && npm test`
Expected: 3 new tests fail with `buildCopySwapBlocks is not a function`.

- [ ] **Step 3.3: Implement `buildCopySwapBlocks`**

Add to `src/slack/blocks.ts` directly after `buildSuggestionChipsBlocks`:

```typescript
export function buildCopySwapBlocks(
  chosenText: string,
  cachedState: string,
): any[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '📋 *Copy and paste:*' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '```\n' + chosenText + '\n```' },
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
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `cd /Users/kj/Documents/Syncraft && npm test`
Expected: All `buildCopySwapBlocks` tests pass.

- [ ] **Step 3.5: Commit**

```bash
git -C /Users/kj/Documents/Syncraft add src/slack/blocks.ts test/chips.test.ts
git -C /Users/kj/Documents/Syncraft commit -m "feat(slack): add buildCopySwapBlocks

Renders the post-click view: chosen reply in a code block (Slack shows a
native copy-on-hover icon) + Back + Dismiss. The back button carries the
serialized cached state so the chip view can be restored without
re-generating suggestions."
```

---

## Task 4: Add `postSuggestionChips()` orchestrator

This is the entry point both `suggest_reply` (shortcut) and `/syncraft reply` (slash command) will call. It wraps the same suggestion-generation flow that `openSuggestionModal()` had, but posts an ephemeral instead of opening a modal.

**Files:**
- Modify: `src/slack/chips.ts` (add `postSuggestionChips`)

- [ ] **Step 4.1: Implement `postSuggestionChips()` in `src/slack/chips.ts`**

Append to `/Users/kj/Documents/Syncraft/src/slack/chips.ts`:

```typescript
import { generateSuggestions } from '../services/replySuggestionService';
import { classifyIntent } from '../services/intentClassifier';
import { getProfile } from '../db/profileRepo';
import { getUserTraits, getPairTraits, getTeamTraits } from '../db/commTraitsRepo';
import { buildSuggestionChipsBlocks } from './blocks';

const URGENCY_KEYWORDS = ['asap', 'urgent', 'blocking', 'eod', 'critical', 'immediately'];

export interface PostSuggestionChipsArgs {
  client: any;
  channelId: string;
  threadTs?: string | null;
  requesterId: string;
  senderId: string;
  messageText: string;
}

export async function postSuggestionChips(args: PostSuggestionChipsArgs): Promise<void> {
  const { client, channelId, threadTs, requesterId, senderId, messageText } = args;

  if (!channelId) {
    console.warn('[postSuggestionChips] missing channelId, skipping');
    return;
  }

  const isUrgent = URGENCY_KEYWORDS.some(kw => messageText.toLowerCase().includes(kw));
  const intent = classifyIntent(messageText);
  const senderProfile = getProfile(senderId);
  const senderTraits = getUserTraits(senderId);
  const requesterTraits = getUserTraits(requesterId);
  const [uA, uB] = [senderId, requesterId].sort();
  const pairTraits = getPairTraits(uA, uB);
  const teamTraits = getTeamTraits('default');

  const context = {
    messageText,
    senderId,
    requesterId,
    senderProfile,
    senderTraits,
    requesterTraits,
    pairTraits,
    teamTraits,
    intent,
    isUrgent,
  };

  const suggestions = generateSuggestions(context);

  // Resolve display name; fall back to id on failure (likely missing users:read scope)
  let senderName = senderId;
  try {
    const info = await client.users.info({ user: senderId });
    const u = (info.user as any) ?? {};
    senderName = u.profile?.display_name_normalized || u.profile?.display_name || u.real_name || u.name || senderId;
  } catch {
    // ignore — keep senderId
  }

  const contextLine = pickContextLine(suggestions, context, senderName);
  const blocks = buildSuggestionChipsBlocks(suggestions, contextLine, senderName);

  try {
    await client.chat.postEphemeral({
      channel: channelId,
      user: requesterId,
      thread_ts: threadTs ?? undefined,
      text: 'Suggested replies',
      blocks,
    });
  } catch (err) {
    console.warn('[postSuggestionChips] postEphemeral failed:', err);
    // Best-effort surface to user
    try {
      await client.chat.postEphemeral({
        channel: channelId,
        user: requesterId,
        text: "Couldn't post suggestions here — try again from a channel.",
      });
    } catch {
      // give up silently — already logged
    }
  }
}
```

- [ ] **Step 4.2: Verify it type-checks**

Run: `cd /Users/kj/Documents/Syncraft && npx tsc --noEmit`
Expected: No errors. (Existing tsc errors unrelated to chips.ts are not introduced by this change.)

- [ ] **Step 4.3: Commit**

```bash
git -C /Users/kj/Documents/Syncraft add src/slack/chips.ts
git -C /Users/kj/Documents/Syncraft commit -m "feat(slack): add postSuggestionChips orchestrator

Builds the SuggestionContext, generates suggestions, picks the context
line, resolves the sender display name, then posts an ephemeral with the
chip blocks. On postEphemeral failure, attempts a one-line error
ephemeral so the user is not left wondering."
```

---

## Task 5: Wire the message shortcut to use chips

Swap `openSuggestionModal` for `postSuggestionChips` in the `suggest_reply` shortcut handler. Pull `channelId` and `threadTs` from the shortcut payload.

**Files:**
- Modify: `src/slack/shortcuts.ts`

- [ ] **Step 5.1: Replace the modal call with a chip call in `suggest_reply`**

Open `/Users/kj/Documents/Syncraft/src/slack/shortcuts.ts`. Find the `suggest_reply` handler (around line 70). Replace the body so it ends with `postSuggestionChips(...)` instead of `openSuggestionModal(...)`:

```typescript
import { postSuggestionChips } from './chips';
// ...

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
```

Remove the `import { openSuggestionModal } from './commands';` line at the top (it's no longer used). The `extractMessageText` helper stays — it's still useful.

- [ ] **Step 5.2: Type-check**

Run: `cd /Users/kj/Documents/Syncraft && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5.3: Commit**

```bash
git -C /Users/kj/Documents/Syncraft add src/slack/shortcuts.ts
git -C /Users/kj/Documents/Syncraft commit -m "feat(slack): swap suggest_reply shortcut to chip ephemeral

The shortcut now posts an ephemeral chip view via postSuggestionChips
instead of opening a modal. Empty-text payloads get a small ephemeral
note rather than a modal error."
```

---

## Task 6: Wire `/syncraft reply` to use chips

The slash command's reply branch in `commands.ts` also calls `openSuggestionModal`. Same swap.

**Files:**
- Modify: `src/slack/commands.ts`

- [ ] **Step 6.1: Replace the modal call in the `/syncraft reply` branch**

Open `/Users/kj/Documents/Syncraft/src/slack/commands.ts`. Find the `if (text.toLowerCase().startsWith('reply'))` block (around line 94). It currently fetches the thread parent then calls `openSuggestionModal(...)`. Change the final call to `postSuggestionChips(...)`:

```typescript
import { postSuggestionChips } from './chips';
// ... near the top of the file

      if (!parentText) {
        await respond({ response_type: 'ephemeral', text: 'No message text found to analyze.' });
        return;
      }

      await postSuggestionChips({
        client,
        channelId: command.channel_id,
        threadTs,
        requesterId: command.user_id,
        senderId,
        messageText: parentText,
      });
      return;
```

- [ ] **Step 6.2: Type-check**

Run: `cd /Users/kj/Documents/Syncraft && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 6.3: Commit**

```bash
git -C /Users/kj/Documents/Syncraft add src/slack/commands.ts
git -C /Users/kj/Documents/Syncraft commit -m "feat(slack): swap /syncraft reply to chip ephemeral

The slash command's reply branch now posts the chip view via
postSuggestionChips for parity with the message shortcut path."
```

---

## Task 7: Add chip action handlers

Three click handlers: chip select (×3 — one per index), back, dismiss. Each updates the ephemeral via `response_url` with `replace_original` or `delete_original`.

**Files:**
- Modify: `src/slack/shortcuts.ts`

- [ ] **Step 7.1: Add the action handlers**

In `/Users/kj/Documents/Syncraft/src/slack/shortcuts.ts`, after the `suggest_reply` handler, add five new action handlers. Remove the existing `for (let i = 1; i <= 3; i++) { app.action(\`copy_suggestion_${i}\`, ...) }` loop — it's being replaced.

```typescript
import { buildCopySwapBlocks, buildSuggestionChipsBlocks } from './blocks';
// (chips import already added in Task 5)

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
        console.warn('[chip_select] failed:', err);
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
```

- [ ] **Step 7.2: Type-check**

Run: `cd /Users/kj/Documents/Syncraft && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 7.3: Commit**

```bash
git -C /Users/kj/Documents/Syncraft add src/slack/shortcuts.ts
git -C /Users/kj/Documents/Syncraft commit -m "feat(slack): add chip click + back + dismiss handlers

chip_select_N swaps the ephemeral to the copy view via response_url
replace_original. chip_back restores the chip view from the cached
state. chip_dismiss deletes the ephemeral. The old copy_suggestion_*
loop is removed in the same change."
```

---

## Task 8: Remove dead modal code

`buildSuggestionModal()` and `openSuggestionModal()` are no longer called. Delete them so the modal path can't drift back in.

**Files:**
- Modify: `src/slack/blocks.ts` (delete `buildSuggestionModal`)
- Modify: `src/slack/commands.ts` (delete `openSuggestionModal`)

- [ ] **Step 8.1: Confirm there are no remaining callers**

Run: `cd /Users/kj/Documents/Syncraft && grep -rn "buildSuggestionModal\|openSuggestionModal" src test`
Expected: Only the function definitions themselves are matched. No callers left.

- [ ] **Step 8.2: Delete `buildSuggestionModal` from `src/slack/blocks.ts`**

Open `src/slack/blocks.ts`. Find `export function buildSuggestionModal(...)` (around line 417). Delete the whole function and the section comment header for it (`// ── Suggestion Modal ──...`). Also drop the `buildSuggestionModal` re-export if any exists.

- [ ] **Step 8.3: Delete `openSuggestionModal` from `src/slack/commands.ts`**

Open `src/slack/commands.ts`. Delete the `export async function openSuggestionModal(...)` block at the bottom of the file (around line 144). Remove any now-unused imports it brought in (`generateSuggestions`, `getPairTraits`, `getTeamTraits`, `getUserTraits` if no other function in the file uses them — check first).

- [ ] **Step 8.4: Type-check**

Run: `cd /Users/kj/Documents/Syncraft && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8.5: Run unit tests**

Run: `cd /Users/kj/Documents/Syncraft && npm test`
Expected: All tests still pass.

- [ ] **Step 8.6: Commit**

```bash
git -C /Users/kj/Documents/Syncraft add src/slack/blocks.ts src/slack/commands.ts
git -C /Users/kj/Documents/Syncraft commit -m "refactor(slack): remove dead modal code

buildSuggestionModal and openSuggestionModal have no callers after the
chip migration. Deleting both so the modal path can't drift back in."
```

---

## Task 9: Manual end-to-end verification in Slack

The unit tests cover the pure logic. The Slack integration needs a real workspace.

**Files:** none (verification only)

- [ ] **Step 9.1: Restart the bot**

Run: `cd /Users/kj/Documents/Syncraft && pkill -f "tsx src/app.ts" 2>/dev/null; sleep 1; npm run dev`
Expected: `⚡ Syncraft is running`. Leave the bot running for the rest of the steps.

- [ ] **Step 9.2: Right-click a channel message → "Suggest Reply with Syncraft"**

In Slack: hover a channel message → ⋯ → Suggest Reply with Syncraft.
Expected: Ephemeral message appears under the source message with up to 3 chips and a Dismiss button. No modal opens.

- [ ] **Step 9.3: Trigger inside a thread**

Open a thread, click ⋯ on a message inside → Suggest Reply with Syncraft.
Expected: The ephemeral lands inside the thread, not the channel root.

- [ ] **Step 9.4: Click a chip**

Click any of the chip buttons.
Expected: The ephemeral swaps in place to a "📋 Copy and paste:" header + a code block with the chip's text + Back + Dismiss buttons. Hovering the code block shows Slack's native copy icon.

- [ ] **Step 9.5: Click Back**

Click `← Back to suggestions`.
Expected: The chip view returns with the same chips and same context line (if any).

- [ ] **Step 9.6: Click Dismiss**

Click `✕ Dismiss` from either the chip view or the copy view.
Expected: The ephemeral disappears entirely.

- [ ] **Step 9.7: Trigger `/syncraft reply` inside a thread**

In a thread, type `/syncraft reply` and submit.
Expected: Same chip ephemeral as Step 9.2, posted inside the thread.

- [ ] **Step 9.8: Verify context line behavior — "no special signal"**

Pick a sender with no stated preference, no urgency in the message, no slow-pair history, no status-check pattern.
Expected: Chip view shows **no** context line above the chips.

- [ ] **Step 9.9: Verify context line behavior — urgency**

Trigger on a message containing a word like `asap` or `urgent`.
Expected: Context line `⚡ Looks urgent — a quick ack now is better than a long reply later` appears above the chips.

- [ ] **Step 9.10: Verify chip label truncation**

If you can find or post a message that produces a suggestion body > 75 characters (e.g., a long template variant), trigger Suggest Reply on it.
Expected: That chip's visible label ends in `…`. Clicking it reveals the full untruncated text in the copy view's code block.

- [ ] **Step 9.11: Note any followups**

If the sender's display name still shows as a raw `U…` ID, that confirms the separate `users:read` scope issue from earlier — out of scope for this change. Note it in your followup list and continue.

---

## Self-review (already run by the plan author)

- **Spec coverage** — every section of [the spec](../specs/2026-05-01-suggestion-chips-design.md) maps to at least one task: trigger surfaces (Tasks 5, 6), chip view (Task 2), copy view (Task 3), context-line rules (Task 1), edge cases — truncation (Task 2.5), thread routing (Tasks 5.1 / 6.1 / 9.3), failure fallback (Task 4.1) — and dead-code removal (Task 8). Manual checklist mirrored in Task 9.
- **Placeholders** — none. Every code step contains the actual code.
- **Type consistency** — `chip_select_0/1/2`, `chip_back`, `chip_dismiss` action ids and the `{ fullText, cachedState }` value shape are used identically across Tasks 2, 3, and 7. `pickContextLine` signature `(suggestions, context, senderName)` is consistent between Task 1 (definition) and Task 4 (usage). `PostSuggestionChipsArgs` shape is consistent between Task 4 (definition) and Tasks 5 / 6 (callers).
