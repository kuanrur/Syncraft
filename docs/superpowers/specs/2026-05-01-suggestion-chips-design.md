# Suggestion Chips — Design Spec

**Date:** 2026-05-01
**Status:** Approved, ready for implementation plan
**Scope:** Replace the "Suggested Replies" modal with an ephemeral, in-thread chip UI.

## Problem

Today, "Suggest Reply with Syncraft" (and `/syncraft reply` in a thread) opens a full Slack modal containing three suggestions, each with a label, body, "Why:" rationale paragraph, and a separate Copy button. Users find it visually heavy and disconnected from the conversation. The closest reference points (Gmail Smart Reply chips, Teams suggested replies) sit inline near the message instead of behind a modal.

Slack's API does not allow third-party apps to inject UI above the message composer (that surface is owned by the Slack client). The closest native pattern is an **ephemeral message** posted into the same channel or thread, visible only to the requester.

## Goal

Make Suggest Reply feel like a lightweight inline action: minimal chrome, three tappable chips next to the message you're replying to, optional one-line context only when it adds genuine value.

## Non-goals

- Replacing "Analyze with Syncraft" — that feature has different content (availability + intent + traits) and a modal remains appropriate.
- Generative or LLM-backed suggestions — out of scope; suggestions stay templated.
- Pre-filling the user's message composer — Slack's API does not allow this.
- Posting replies on behalf of the user — Slack apps cannot post as a user; clicking a chip stays in copy mode.
- Schema changes — reuses existing observation, trait, and suggestion plumbing.

## User-visible behavior

### Trigger surfaces (unchanged)

- **Message shortcut** `Suggest Reply with Syncraft` (callback id `suggest_reply`) on any channel message.
- **Slash command** `/syncraft reply` invoked inside a thread.

### Initial chip view

After triggering, the bot posts an ephemeral message in the same channel as the source message, in the thread if a `thread_ts` is present:

```
[ optional context line — only if a "special" signal hits ]

[ Got it, thanks. ]   [ Thanks — I'll follow up once I have an update. ]   [ Sounds good. ]

                                                                                 ✕ Dismiss
```

- Each chip is a Block Kit `button` whose label is the suggestion text.
- Up to three chips, matching the count returned by `generateSuggestions()`.
- A `Dismiss` button removes the ephemeral via `response_url` + `delete_original: true`.

### Context line — when shown

Exactly one short line, picked in this priority order. If no rule matches, the line is omitted and the message contains chips only.

| Priority | Trigger | Line |
|---|---|---|
| 1 | `senderTraits.statedPreferences[0]` is non-empty | `💡 {senderName} has said: "{preference}"` |
| 2 | `isUrgent === true` (the existing keyword check in `openSuggestionModal`) | `⚡ Looks urgent — a quick ack now is better than a long reply later` |
| 3 | `pairTraits` exists and the requester's median reply time to the sender (`avgResponseTimeAtoBMin` or `BtoAMin`, whichever direction matches) > 120 min | `⏱ You usually reply to {senderName} in 2+ hours — a fast ack helps` |
| 4 | The "Proactive update" suggestion variant is in the returned suggestions (only present when `senderTraits.topIntentsSent` includes `status_check`) | `📊 {senderName} often follows up for status — a proactive update can prevent the next ping` |

Explicitly suppressed (never shown):

- Formality / length / emoji descriptions ("Based on Kevin's casual style").
- Thin-data warnings ("Still learning Kevin's style").
- "Based on message intent only" and similar pure-description text.

### Click behavior

Clicking a chip swaps the ephemeral message in place via `response_url` + `replace_original: true` to a copy view:

```
📋 Copy and paste:
```
Got it, thanks.
```

[ ← Back to suggestions ]   [ ✕ Dismiss ]
```

- The suggestion is rendered inside a Slack code block. Slack natively shows a copy icon on hover for code blocks, so paste-and-send takes one click + paste.
- `← Back to suggestions` re-renders the chip view from the same suggestion set (no re-generation; cached in the action `value` payload).
- `Dismiss` deletes the ephemeral.

### Edge cases

- **Chip label > 75 characters** (Slack's hard limit on button label length): truncate to 72 chars + `…` for the visible label; the full untruncated text goes into the button's `value` field and is what gets shown in the copy view on click.
- **Source message has `thread_ts`**: pass `thread_ts` to `chat.postEphemeral` so the chips appear inside the thread, not at the channel root.
- **Source message has no `thread_ts`**: post the ephemeral at the channel root, immediately after the source message in the requester's view.
- **`generateSuggestions()` returns fewer than 3**: render the chips that exist; layout still works.
- **Channel id missing on the shortcut payload** (rare; would mean Slack invoked the shortcut without a message context): post a brief ephemeral error via `respond` if available, otherwise log and no-op.
- **Ephemeral posting fails** (`channel_not_found`, `restricted_action`, etc.): catch, log, and respond with a one-line error ("Couldn't post suggestions here — try again from a channel."). No silent failure, no modal fallback (the modal path is being removed).

## Architecture

### Module touch points

```
src/slack/shortcuts.ts
  - suggest_reply handler: call postSuggestionChips() instead of openSuggestionModal()
  - register chip_select_0/1/2 action handlers (replace existing copy_suggestion_*)
  - register chip_back action handler
  - register chip_dismiss action handler

src/slack/commands.ts
  - /syncraft reply branch: call postSuggestionChips() instead of openSuggestionModal()
  - delete openSuggestionModal() (no longer needed; the chip path is the only path)

src/slack/blocks.ts
  - add buildSuggestionChipsBlocks(suggestions, contextLine?, senderName)
  - add buildCopySwapBlocks(chosenText, cachedState)
  - delete buildSuggestionModal() (now unused)

src/slack/chips.ts  [new file]
  - postSuggestionChips({ client, channelId, threadTs, requesterId, senderId, messageText })
  - pickContextLine(suggestions, context, senderName) → string | null
```

### Data flow

1. Trigger handler resolves `messageText`, `senderId`, `requesterId`, `channelId`, optional `threadTs`.
2. `postSuggestionChips()` builds the same `SuggestionContext` the modal path used (intent, urgency, sender/requester/pair/team traits) and calls `generateSuggestions()`.
3. `pickContextLine()` walks the four priority rules; returns the first match or `null`.
4. `buildSuggestionChipsBlocks()` renders the optional context line + up to three chips + a Dismiss button. Each chip's `value` is a JSON-encoded `{ index, fullText, allSuggestions, senderName }` payload so back/forward swaps work without re-generation.
5. `client.chat.postEphemeral({ channel, user, thread_ts?, blocks })`.

On chip click:

1. `chip_select_N` handler reads `action.value`, decodes `{ fullText, allSuggestions, senderName }`.
2. `buildCopySwapBlocks()` renders the code block + Back + Dismiss.
3. Handler responds to `response_url` with `replace_original: true` and the new blocks.

On Back click:

1. `chip_back` handler reads `action.value` (the cached `allSuggestions` + `senderName` + `contextLine`).
2. Re-renders chip view via `replace_original: true`.

On Dismiss click:

1. `chip_dismiss` handler responds to `response_url` with `delete_original: true`.

### Why a new `chips.ts` module

The shortcut and slash-command handlers both need the same posting logic; today the modal-opener already lives outside `shortcuts.ts` (in `commands.ts`) for that reason, but its location is awkward. A dedicated `chips.ts` puts the new surface in one place and keeps `shortcuts.ts` and `commands.ts` thin.

## Privacy

No change to the existing model: the observer continues to store metadata only, no message text. The chip view does not log the source message text. Action `value` payloads contain the suggestion bodies (which the bot generated) and the sender display name — these stay within Slack's interaction payload roundtrip and are not persisted.

## Testing

Manual checklist (the project has no automated test harness yet):

- [ ] Right-click a channel message → `Suggest Reply with Syncraft` → ephemeral appears under the message with three chips, no context line if no special signal applies.
- [ ] Trigger on a sender with a stated preference → context line shows the quoted preference.
- [ ] Trigger on a message containing `asap` / `urgent` / `blocking` / `eod` → context line shows the urgency hint.
- [ ] Trigger from inside a thread → ephemeral lands in the thread, not the channel root.
- [ ] Click a chip → ephemeral swaps to the copy view; code block hover shows Slack's native copy icon.
- [ ] Click `← Back to suggestions` → chip view returns with the same three chips.
- [ ] Click `✕ Dismiss` from either view → ephemeral disappears.
- [ ] `/syncraft reply` inside a thread produces the same chip flow.
- [ ] Chip labels longer than 75 chars render truncated with `…`; clicking shows the full untruncated text in the copy view.
- [ ] If `chat.postEphemeral` fails (force this by simulating an error), the user sees a clear one-line error message rather than silent failure.

## Out of scope (followups)

- Display name resolution still depends on the `users:read` OAuth scope being added to the bot. Without it, `users.info` fails and the chip view falls back to the raw user id. Tracking separately.
- Telemetry on which chip variant is chosen most often. Worth instrumenting later to validate suggestion quality.
- Replacing the "Analyze with Syncraft" modal. Out of scope here.
