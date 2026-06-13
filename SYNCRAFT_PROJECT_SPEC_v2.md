# SYNCRAFT — Project Spec v2.0

> **Audience**: Coding agent (Claude, Cursor, etc.)
> **Objective**: Build a working Slack prototype in a single session.
> **Read this entire file before writing any code.**

---

## 0. What Is Syncraft

Syncraft is a personal communication assistant for remote teams, deployed as a Slack app.
It answers two questions:

1. **"What's the best way and time to reach this person?"**
   → Static profile data: timezone, work hours, sleep hours, response speed.

2. **"Given what I know about this person and this team, how should I reply?"**
   → Learned communication patterns: observed passively from public channel messages, stored as derived traits (never raw text), used to generate contextual reply suggestions.

Syncraft observes passively and surfaces actively. It only speaks when invoked.

---

## 1. Prototype Scope

### In Scope

- Single Slack workspace
- Socket Mode (local dev, no public URL needed)
- Slash command: `/syncraft @user` and `/syncraft reply`
- Message shortcuts: "Analyze with Syncraft" + "Suggest Reply with Syncraft"
- App Home: view/edit profile + view learned communication style + privacy controls
- Modal: edit profile fields
- SQLite storage (single file, no server)
- Rule-based availability + reply estimation
- Keyword-based message intent classification
- Passive observation of public channel messages (metadata only, no text stored)
- Per-user, per-pair, and per-team communication trait aggregation
- Template-based reply suggestion engine

### Out of Scope

- ML/AI prediction, LLM calls, sentiment analysis
- Calendar sync, automatic status detection
- Cross-workspace federation
- Production auth, OAuth install flow
- DM or private channel monitoring
- Automatic message rewriting (suggestions are opt-in, copy-paste)

---

## 2. Tech Stack

| Component       | Choice                          | Why                                    |
|-----------------|---------------------------------|----------------------------------------|
| Language        | TypeScript                      | Type safety, Bolt SDK support          |
| Runtime         | Node.js >= 18                   | LTS, native fetch                      |
| Slack SDK       | `@slack/bolt` (latest)          | Official, supports Socket Mode         |
| Database        | SQLite via `better-sqlite3`     | Zero config, single file, synchronous  |
| Time handling   | `luxon` (DateTime, IANAZone)    | Robust timezone math, IANA native      |
| Build           | `tsx` (dev) / `tsc` (build)     | Fast iteration, no separate compile    |

### Install Command

```bash
npm init -y
npm install @slack/bolt better-sqlite3 luxon tsx typescript dotenv
npm install -D @types/better-sqlite3 @types/node
```

---

## 3. Slack App Configuration

The developer must create a Slack app at https://api.slack.com/apps before running.

### Required App Settings

| Setting                    | Value                                                       |
|----------------------------|-------------------------------------------------------------|
| Socket Mode                | **Enabled**                                                 |
| App-Level Token            | Generate with scope `connections:write`                     |
| Bot Token Scopes           | `commands`, `chat:write`, `users:read`, `channels:history`, `channels:read` |
| Slash Command              | `/syncraft` — Description: "Check availability or get reply suggestions" |
| Message Shortcut #1        | callback_id: `analyze_message` — Name: "Analyze with Syncraft" |
| Message Shortcut #2        | callback_id: `suggest_reply` — Name: "Suggest Reply with Syncraft" |
| App Home → Home Tab        | **Enabled**                                                 |
| Event Subscriptions        | `app_home_opened`, `message.channels`                       |

### Environment Variables

```env
# .env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...    # App-level token for Socket Mode
SLACK_SIGNING_SECRET=...
```

> **Do NOT hardcode tokens.** Load from `.env` via `dotenv`.

---

## 4. Directory Structure

```
syncraft/
├── src/
│   ├── app.ts                        # Entry point: init Bolt, register all handlers, start
│   ├── config.ts                     # Load env vars, export typed config
│   ├── db/
│   │   ├── client.ts                 # Initialize SQLite, create all tables
│   │   ├── profileRepo.ts            # CRUD: getProfile, upsertProfile
│   │   ├── observationRepo.ts        # Insert observations, query for aggregation
│   │   └── commTraitsRepo.ts         # CRUD for user/pair/team comm traits
│   ├── services/
│   │   ├── availabilityService.ts    # Compute status + local time from profile
│   │   ├── replyEstimateService.ts   # Compute reply window string
│   │   ├── intentClassifier.ts       # Keyword-based intent detection
│   │   ├── messageAnalyzer.ts        # Extract metadata from a single message
│   │   ├── traitAggregator.ts        # Compute user/pair/team traits from observations
│   │   ├── preferenceDetector.ts     # Extract stated preferences from messages
│   │   ├── meetingDetector.ts        # Classify meeting patterns
│   │   └── replySuggestionService.ts # Core template-based suggestion engine
│   ├── slack/
│   │   ├── commands.ts               # /syncraft @user + /syncraft reply handlers
│   │   ├── shortcuts.ts              # analyze_message + suggest_reply handlers
│   │   ├── observer.ts               # Passive message listener (public channels)
│   │   ├── appHome.ts                # app_home_opened event handler
│   │   ├── modals.ts                 # Modal open + submission handlers
│   │   └── blocks.ts                 # All Block Kit JSON builders (pure functions)
│   ├── types/
│   │   └── index.ts                  # All shared types and interfaces
│   └── utils/
│       └── time.ts                   # Luxon helpers, timezone validation
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Data Model

### 5A. Table: `profiles` — Manual user settings

```sql
CREATE TABLE IF NOT EXISTS profiles (
  slack_user_id     TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL DEFAULT '',
  timezone          TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  work_start        TEXT NOT NULL DEFAULT '09:00',
  work_end          TEXT NOT NULL DEFAULT '17:00',
  sleep_start       TEXT NOT NULL DEFAULT '23:00',
  sleep_end         TEXT NOT NULL DEFAULT '07:00',
  role              TEXT NOT NULL DEFAULT '',
  response_speed    TEXT NOT NULL DEFAULT 'medium' CHECK(response_speed IN ('fast','medium','slow')),
  sharing_enabled   INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5B. Table: `message_observations` — Raw observation log (metadata only)

Stores only derived metadata per message. **Never stores message text.**
Aged out after 30 days. Processed into trait aggregates, then discarded.

```sql
CREATE TABLE IF NOT EXISTS message_observations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slack_user_id     TEXT NOT NULL,
  channel_id        TEXT NOT NULL,
  thread_ts         TEXT,              -- null if top-level message
  parent_user_id    TEXT,              -- who they're replying to (if thread reply)
  word_count        INTEGER NOT NULL,
  has_greeting      INTEGER NOT NULL DEFAULT 0,
  has_signoff       INTEGER NOT NULL DEFAULT 0,
  has_emoji         INTEGER NOT NULL DEFAULT 0,
  formality_score   INTEGER NOT NULL DEFAULT 0,   -- -2 to +2
  detected_intent   TEXT NOT NULL DEFAULT 'general',
  is_question       INTEGER NOT NULL DEFAULT 0,
  is_thread_reply   INTEGER NOT NULL DEFAULT 0,
  is_weekend        INTEGER NOT NULL DEFAULT 0,
  hour_local        INTEGER,           -- 0–23 in user's timezone
  timestamp_utc     TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Run cleanup on app startup:
```sql
DELETE FROM message_observations WHERE created_at < datetime('now', '-30 days');
```

### 5C. Table: `user_comm_traits` — Aggregated per-user communication patterns

```sql
CREATE TABLE IF NOT EXISTS user_comm_traits (
  slack_user_id              TEXT PRIMARY KEY,
  avg_message_length         REAL NOT NULL DEFAULT 0,
  length_bucket              TEXT NOT NULL DEFAULT 'moderate' CHECK(length_bucket IN ('terse','moderate','verbose')),
  uses_greetings             INTEGER NOT NULL DEFAULT 0,
  uses_signoffs              INTEGER NOT NULL DEFAULT 0,
  uses_emoji                 INTEGER NOT NULL DEFAULT 0,
  formality                  TEXT NOT NULL DEFAULT 'mixed' CHECK(formality IN ('casual','mixed','formal')),
  peak_active_hours_json     TEXT NOT NULL DEFAULT '[]',
  avg_response_time_min      REAL NOT NULL DEFAULT 0,
  responds_on_weekends       INTEGER NOT NULL DEFAULT 0,
  top_intents_sent_json      TEXT NOT NULL DEFAULT '[]',
  top_intents_received_json  TEXT NOT NULL DEFAULT '[]',
  asks_clarifying_questions  INTEGER NOT NULL DEFAULT 0,
  prefers_threads            INTEGER NOT NULL DEFAULT 0,
  meeting_request_style      TEXT NOT NULL DEFAULT 'unknown',
  preferred_meeting_times_json TEXT NOT NULL DEFAULT '[]',
  stated_preferences_json    TEXT NOT NULL DEFAULT '[]',
  messages_sampled           INTEGER NOT NULL DEFAULT 0,
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (slack_user_id) REFERENCES profiles(slack_user_id)
);
```

### 5D. Table: `pair_comm_traits` — Aggregated per-pair relationship patterns

```sql
CREATE TABLE IF NOT EXISTS pair_comm_traits (
  user_a                     TEXT NOT NULL,
  user_b                     TEXT NOT NULL,
  total_interactions         INTEGER NOT NULL DEFAULT 0,
  avg_response_a_to_b_min    REAL NOT NULL DEFAULT 0,
  avg_response_b_to_a_min    REAL NOT NULL DEFAULT 0,
  dominant_requester         TEXT,
  dominant_intent_a_to_b     TEXT NOT NULL DEFAULT 'general',
  dominant_intent_b_to_a     TEXT NOT NULL DEFAULT 'general',
  formality_match            INTEGER NOT NULL DEFAULT 1,
  length_match               INTEGER NOT NULL DEFAULT 1,
  common_topics_json         TEXT NOT NULL DEFAULT '[]',
  last_interaction           TEXT,
  messages_sampled           INTEGER NOT NULL DEFAULT 0,
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_a, user_b)
);
```

**Pair dedup rule**: Always store with lexicographically smaller user ID as `user_a`.

### 5E. Table: `team_comm_traits` — Workspace-level defaults (fallback)

```sql
CREATE TABLE IF NOT EXISTS team_comm_traits (
  workspace_id               TEXT PRIMARY KEY,
  avg_message_length         REAL NOT NULL DEFAULT 0,
  dominant_formality         TEXT NOT NULL DEFAULT 'mixed',
  common_meeting_pattern     TEXT NOT NULL DEFAULT 'mixed',
  peak_hours_utc_json        TEXT NOT NULL DEFAULT '[]',
  avg_response_time_min      REAL NOT NULL DEFAULT 0,
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 6. TypeScript Types

**File**: `src/types/index.ts`

```typescript
// ── Profile (manual) ────────────────────────────────

type ResponseSpeed = 'fast' | 'medium' | 'slow';

interface SyncraftProfile {
  slackUserId: string;
  displayName: string;
  timezone: string;        // IANA, e.g. "Asia/Kolkata"
  workStart: string;       // "HH:mm" 24h format
  workEnd: string;
  sleepStart: string;
  sleepEnd: string;
  role: string;
  responseSpeed: ResponseSpeed;
  sharingEnabled: boolean;
}

// ── Availability ────────────────────────────────────

interface AvailabilityResult {
  localTimeString: string;
  status: 'available' | 'outside_work_hours' | 'likely_asleep';
  statusLabel: string;
}

// ── Intent ──────────────────────────────────────────

type IntentType = 'eta_request' | 'clarification' | 'approval' | 'status_check' | 'general';

interface IntentResult {
  intent: IntentType;
  label: string;
  suggestion: string;
}

// ── Communication Traits (learned) ──────────────────

type LengthBucket = 'terse' | 'moderate' | 'verbose';
type Formality = 'casual' | 'mixed' | 'formal';
type MeetingStyle = 'proposes_specific_time' | 'asks_for_availability' | 'defers_to_other' | 'unknown';

interface UserCommTraits {
  slackUserId: string;
  avgMessageLength: number;
  lengthBucket: LengthBucket;
  usesGreetings: boolean;
  usesSignoffs: boolean;
  usesEmoji: boolean;
  formality: Formality;
  peakActiveHoursLocal: string[];    // e.g. ["09:00-11:00", "14:00-16:00"]
  avgResponseTimeMin: number;
  respondsOnWeekends: boolean;
  topIntentsSent: string[];          // top 3 intent types
  topIntentsReceived: string[];
  asksClarifyingQuestions: boolean;
  prefersThreads: boolean;
  typicalMeetingRequestStyle: MeetingStyle;
  preferredMeetingTimes: string[];   // e.g. ["morning", "after_lunch"]
  statedPreferences: string[];       // e.g. ["I prefer bullet points"]
  messagesSampled: number;
  lastUpdated: string;
}

interface PairCommTraits {
  userA: string;                     // lexicographically smaller user ID
  userB: string;
  totalInteractions: number;
  avgResponseTimeAtoBMin: number;
  avgResponseTimeBtoAMin: number;
  dominantRequester: string | null;
  dominantIntentAtoB: string;
  dominantIntentBtoA: string;
  formalityMatch: boolean;
  lengthMatch: boolean;
  commonTopics: string[];
  lastInteraction: string;
  messagesSampled: number;
  lastUpdated: string;
}

interface TeamCommTraits {
  workspaceId: string;
  avgMessageLength: number;
  dominantFormality: Formality;
  commonMeetingPattern: string;
  peakHoursUtc: string[];
  avgResponseTimeMin: number;
  lastUpdated: string;
}

// ── Message Observation (metadata only) ─────────────

interface MessageObservation {
  slackUserId: string;
  channelId: string;
  threadTs: string | null;
  parentUserId: string | null;
  wordCount: number;
  hasGreeting: boolean;
  hasSignoff: boolean;
  hasEmoji: boolean;
  formalityScore: number;            // -2 to +2
  detectedIntent: IntentType;
  isQuestion: boolean;
  isThreadReply: boolean;
  isWeekend: boolean;
  hourLocal: number | null;          // 0–23
  timestampUtc: string;
}

// ── Reply Suggestions ───────────────────────────────

interface ReplySuggestion {
  label: string;          // e.g. "Direct & concise"
  body: string;           // The suggested reply text
  reasoning: string;      // Why this approach fits
}

interface SuggestionContext {
  messageText: string;
  senderId: string;
  requesterId: string;
  senderProfile: SyncraftProfile | null;
  senderTraits: UserCommTraits | null;
  requesterTraits: UserCommTraits | null;
  pairTraits: PairCommTraits | null;
  teamTraits: TeamCommTraits | null;
  intent: IntentResult;
  isUrgent: boolean;
}
```

---

## 7. Core Services

### 7A. Availability Service

**File**: `src/services/availabilityService.ts`

**Input**: `SyncraftProfile`
**Output**: `AvailabilityResult`

**Logic**:

```
1. Get current time in profile.timezone using Luxon:
   now = DateTime.now().setZone(profile.timezone)

2. Extract current HH:mm as minutes-since-midnight:
   currentMinutes = now.hour * 60 + now.minute

3. Parse all time boundaries to minutes-since-midnight:
   workStartMin, workEndMin, sleepStartMin, sleepEndMin

4. Check sleep window FIRST (it commonly crosses midnight):
   isSleeping = isInWrappingRange(currentMinutes, sleepStartMin, sleepEndMin)

5. Then check work window:
   isWorking = isInWrappingRange(currentMinutes, workStartMin, workEndMin)

6. Priority: likely_asleep > available > outside_work_hours
```

**CRITICAL: Midnight-wrapping logic**

```typescript
function isInWrappingRange(current: number, start: number, end: number): boolean {
  if (start <= end) {
    return current >= start && current < end;
  } else {
    // Wraps midnight: e.g. 23:00–07:00 → sleeping if current >= 23:00 OR current < 07:00
    return current >= start || current < end;
  }
}
```

### 7B. Reply Estimate Service

**File**: `src/services/replyEstimateService.ts`

**Input**: `AvailabilityResult['status']`, `SyncraftProfile['responseSpeed']`
**Output**: `string`

| Status              | Speed  | Estimate         |
|---------------------|--------|------------------|
| likely_asleep       | *any*  | 6 – 10 hours     |
| outside_work_hours  | *any*  | 2 – 6 hours      |
| available           | fast   | 30 min – 2 hours |
| available           | medium | 1 – 3 hours      |
| available           | slow   | 2 – 5 hours      |

### 7C. Intent Classifier

**File**: `src/services/intentClassifier.ts`

**Input**: `string` (message text)
**Output**: `IntentResult`

**Keyword map** (check lowercase, first match wins):

| Intent         | Keywords/Phrases                                                       |
|----------------|------------------------------------------------------------------------|
| eta_request    | `when will`, `eta`, `by when`, `timeline`, `deadline`, `how long`, `when can`, `when is`, `due date`, `finish`, `done by` |
| clarification  | `can you explain`, `what does this mean`, `clarify`, `help me understand`, `what do you mean`, `confused`, `unclear` |
| approval       | `can i proceed`, `approve`, `sign off`, `okay to move forward`, `go ahead`, `greenlight`, `thumbs up`, `permission` |
| status_check   | `any update`, `where are we`, `progress`, `status`, `how is`, `how's it going`, `what's the latest` |
| general        | *(fallback)*                                                           |

**Suggestions per intent**:

| Intent         | Suggestion                                                              |
|----------------|-------------------------------------------------------------------------|
| eta_request    | "This asks for a timeline. Consider specifying whether you want a rough estimate or a firm commitment." |
| clarification  | "This asks for clarification. Including what specifically is unclear may get a faster answer." |
| approval       | "This requests approval. Stating what exactly needs sign-off and any deadline helps." |
| status_check   | "This is a status check. Mentioning which aspect you care about most can focus the reply." |
| general        | "General message. No specific optimization suggested."                   |

### 7D. Message Analyzer

**File**: `src/services/messageAnalyzer.ts`

Takes a raw message text string (temporarily in memory) and returns a `MessageObservation`.
The text is **discarded after this function returns** — only the metadata is stored.

```typescript
function analyzeMessage(
  text: string,
  slackUserId: string,
  channelId: string,
  threadTs: string | null,
  parentUserId: string | null,
  messageTs: string,
  userTimezone: string | null
): MessageObservation;
```

**Extraction rules**:

| Field            | How                                                                         |
|------------------|-----------------------------------------------------------------------------|
| `wordCount`      | `text.split(/\s+/).filter(w => w.length > 0).length`                       |
| `hasGreeting`    | First 3 words match: hi, hey, hello, good morning, good afternoon, morning, evening |
| `hasSignoff`     | Last 5 words match: thanks, thank you, cheers, best, regards, ty, thx      |
| `hasEmoji`       | Regex: `/[\p{Emoji_Presentation}\p{Extended_Pictographic}]\|:[a-z_]+:/gu`   |
| `formalityScore` | +1 if starts with capital letter; +1 if ends with period; -1 if all lowercase; -1 if contains slang (u, thx, lol, idk, lmk, nvm, tbh). Clamp to [-2, +2]. |
| `detectedIntent` | Run `intentClassifier(text).intent`                                         |
| `isQuestion`     | `text.includes('?') && wordCount < 30`                                      |
| `isThreadReply`  | `threadTs !== null && threadTs !== messageTs`                                |
| `isWeekend`      | Convert messageTs to user timezone (or UTC), check day is Sat/Sun           |
| `hourLocal`      | Convert messageTs to user timezone, extract hour (0–23)                     |

### 7E. Trait Aggregator

**File**: `src/services/traitAggregator.ts`

Called lazily — triggered every N=20 observations per user.

```typescript
function aggregateUserTraits(slackUserId: string): UserCommTraits;
function aggregatePairTraits(userA: string, userB: string): PairCommTraits;
function aggregateTeamTraits(workspaceId: string): TeamCommTraits;
```

**aggregateUserTraits logic**:

```
1. SELECT all message_observations for this user (last 30 days)
2. Compute:
   avgMessageLength   = AVG(word_count)
   lengthBucket       = <15 → terse, 15–60 → moderate, >60 → verbose
   usesGreetings      = SUM(has_greeting) / COUNT(*) > 0.3
   usesSignoffs       = SUM(has_signoff) / COUNT(*) > 0.3
   usesEmoji          = SUM(has_emoji) / COUNT(*) > 0.3
   formality          = AVG(formality_score): <-0.5 → casual, >0.5 → formal, else mixed
   peakActiveHours    = GROUP BY hour_local, find top-2 contiguous 2-hour windows
   avgResponseTimeMin = for rows where is_thread_reply=1 AND parent_user_id IS NOT NULL,
                        compute (this message timestamp - parent message timestamp),
                        take median
   respondsOnWeekends = SUM(is_weekend) >= 3
   topIntentsSent     = GROUP BY detected_intent, ORDER BY count DESC, take top 3
   asksClarifyingQuestions = (rows where is_question=1 AND is_thread_reply=1) / 
                            (rows where is_thread_reply=1) > 0.3
   prefersThreads     = SUM(is_thread_reply) / COUNT(*) > 0.6
3. UPSERT into user_comm_traits
```

**aggregatePairTraits logic**:

```
1. SELECT observations where (user=A AND parent_user=B) OR (user=B AND parent_user=A)
2. Compute per-direction response times, interaction counts, dominant intents
3. formalityMatch = both users have same formality bucket
4. lengthMatch = both users have same length_bucket
5. UPSERT into pair_comm_traits (with lexicographic user_a/user_b ordering)
```

### 7F. Preference Detector

**File**: `src/services/preferenceDetector.ts`

Called by the message analyzer when processing each message.
Scans for explicit preference statements and stores them.

```typescript
function detectPreferences(text: string): string[];
```

**Trigger phrases** (check lowercased text):
```
"i prefer", "please don't", "don't .* me", "i'd rather",
"can you not", "can you please", "i like when", "it would be better if",
"for future reference", "fyi i", "just so you know",
"my preference is", "heads up i"
```

When detected, extract the full sentence containing the trigger phrase.
Store in `stated_preferences_json` (max 10 per user, FIFO — oldest drops off).

Examples:
- "I prefer bullet points over paragraphs" → stored
- "Please don't tag me in announcements" → stored
- "FYI I'm usually offline on Fridays" → stored

### 7G. Meeting Detector

**File**: `src/services/meetingDetector.ts`

Called by the message analyzer when meeting keywords are found.

**Meeting trigger keywords**:
```
meet, meeting, call, sync, standup, 1:1, one-on-one,
huddle, catch up, jump on, schedule, calendar, block time,
free at, available at, works for me, how about, let's find
```

**Style classification**:

| Style                    | Pattern                                                          |
|--------------------------|------------------------------------------------------------------|
| `proposes_specific_time` | Contains time reference: "let's meet at 3pm", "how about Tuesday 10am" |
| `asks_for_availability`  | "when are you free", "what times work", "send me your availability" |
| `defers_to_other`        | "whenever works for you", "I'm flexible", "you pick"            |

**Time preference extraction**:
```
"morning" / "AM" → morning
"afternoon" / "after lunch" / "PM" → afternoon
"evening" / "end of day" / "EOD" → evening
```

Store as running counters per user; dominant pattern becomes the trait value.

### 7H. Reply Suggestion Service

**File**: `src/services/replySuggestionService.ts`

The core output of the intelligence layer. Generates 2–3 reply strategies
tailored to the recipient and context.

**This is rule-based template composition, NOT LLM generation.**

```typescript
function generateSuggestions(context: SuggestionContext): ReplySuggestion[];
```

**Step 1 — Determine reply style parameters from trait data**:

```
targetLength:
  if sender's lengthBucket === 'terse'    → keep reply under 20 words
  if sender's lengthBucket === 'verbose'  → include detail, 40–80 words okay
  else                                    → 20–40 words
  OVERRIDE: if pairTraits show length mismatch, lean toward SENDER's style

targetFormality:
  if sender's formality === 'formal'      → full sentences, proper greeting
  if sender's formality === 'casual'      → relaxed, can skip greeting
  else                                    → match requester's own style

includeGreeting:  sender.usesGreetings ? yes : optional
includeSignoff:   sender.usesSignoffs ? yes : skip
useEmoji:         sender.usesEmoji ? include 1–2 : none
```

**Step 2 — Generate template-based suggestions per intent**:

**Intent: eta_request** (someone asked "when will X be done?")
```
Suggestion 1 — "Give a range"
  "[greeting?] Looking at [rough timeframe]. I'll update you [when/by]. [signoff?]"
  Reasoning: "[Sender] tends to ask for timelines. A range sets expectations without over-committing."

Suggestion 2 — "Acknowledge + clarify scope"
  "[greeting?] Working on it — do you need a rough ETA or a firm deadline? [signoff?]"
  Reasoning: "[Sender] frequently asks clarifying questions themselves; they'll appreciate the distinction."

Suggestion 3 — "Proactive update" (only if sender frequently sends status_check)
  "[greeting?] [Status]. Next milestone: [X] by [date]. I'll flag blockers. [signoff?]"
  Reasoning: "[Sender] often follows up for status. A proactive update may prevent the next check-in."
```

**Intent: status_check** ("any updates on X?")
```
Suggestion 1 — "Quick status"
  "[greeting?] [Status: on track / blocked / done]. [One-line detail]. [signoff?]"

Suggestion 2 — "Status + next step"
  "[greeting?] [Status]. Next up: [action]. ETA: [timeframe]. [signoff?]"
```

**Intent: approval** ("can I proceed with X?")
```
Suggestion 1 — "Approve with context"
  "[greeting?] Yes, go ahead. [One caveat if any]. [signoff?]"

Suggestion 2 — "Approve with condition"
  "[greeting?] Approved — just make sure [condition]. [signoff?]"

Suggestion 3 — "Defer / need more info"
  "[greeting?] Before I sign off, can you [specific question]? [signoff?]"
```

**Intent: clarification** ("what does X mean?")
```
Suggestion 1 — "Concise explanation"
  "[greeting?] [Brief answer]. [signoff?]"

Suggestion 2 — "Explain + offer more"
  "[greeting?] [Brief explanation]. Happy to walk through it in more detail. [signoff?]"
```

**Intent: general** (fallback)
```
Suggestion 1 — "Acknowledge"
  "[greeting?] Got it, thanks. [signoff?]"

Suggestion 2 — "Acknowledge + next step"
  "[greeting?] Thanks — I'll [action]. [signoff?]"
```

**Step 3 — Apply pair-specific context to reasoning**:

```
If pairTraits.dominantRequester === sender:
  → reasoning += "[Sender] usually initiates with you. Quick acknowledgment goes a long way."

If pairTraits.avgResponseTimeBtoAMin > 120:
  → reasoning += "You usually reply to [Sender] in 2+ hours. If this is urgent, a quick ack now helps."

If sender.asksClarifyingQuestions:
  → bias toward suggestions with more upfront detail

If sender.statedPreferences has a relevant preference:
  → reasoning += "Note: [Sender] has said: '[preference]'"
  → adjust template to match preference (e.g. bullet points, concise)
```

**Graceful degradation**:

```
If sender has no traits (< 10 observations):
  → Skip style adaptation, use requester's own style as baseline
  → reasoning notes: "Still learning about [Sender]'s style. Suggestions based on message intent only."

If no pair data:
  → Skip pair-specific reasoning

If no team data:
  → Use hardcoded defaults: moderate length, mixed formality
```

---

## 8. Slack Handlers

### 8A. Slash Command: `/syncraft`

**File**: `src/slack/commands.ts`

**Registration**: `app.command('/syncraft', handler)`

**Behavior — route by argument**:

```
Parse command.text:

Case 1: text matches /<@(U[A-Z0-9]+)(?:\|[^>]*)?>/  → LOOKUP mode
  1. Extract target user ID
  2. Load profile. If none → "No Syncraft profile found for this user yet."
  3. If sharing disabled → "This user has chosen not to share their availability."
  4. Compute availability + reply estimate
  5. Load user comm traits (if available)
  6. Build and return ephemeral response with blocks

Case 2: text starts with "reply"  → SUGGEST mode
  1. Must be invoked in a thread (check if thread_ts exists in command payload)
  2. If not in thread → "Use `/syncraft reply` inside a thread to get suggestions."
  3. Fetch the parent message of the thread
  4. Run full suggestion flow (see §7H)
  5. Open a modal with suggestions

Case 3: no argument or unrecognized → HELP
  Respond ephemeral: "Usage:\n• `/syncraft @someone` — Check availability\n• `/syncraft reply` — Get reply suggestions (use in a thread)"
```

**Lookup response blocks** (ephemeral):

```
┌─────────────────────────────────────────┐
│ 📍 [Display Name]                       │  ← Header block
├─────────────────────────────────────────┤
│ Role: Engineer                          │  ← Section with fields
│ Local Time: 1:32 AM                     │
│ Status: Likely asleep 💤                │
│ Expected Reply: 6 – 10 hours            │
├─────────────────────────────────────────┤
│ 🧠 Communication Style                  │  ← Only if traits exist
│ Message style: Concise & casual         │
│ Prefers threads: Yes                    │
│ Avg reply time: ~18 min                 │
│ Note: "I prefer bullet points"          │
├─────────────────────────────────────────┤
│ 💡 Tip: Consider sending during their   │  ← Context block
│    work hours (10:00 – 18:00 IST).      │
└─────────────────────────────────────────┘
```

**Tip logic**:

| Status              | Tip                                                                |
|---------------------|--------------------------------------------------------------------|
| likely_asleep       | "Consider sending during their work hours ([workStart] – [workEnd] [tz])." |
| outside_work_hours  | "They're outside work hours but may check messages occasionally."  |
| available           | "They're in work hours. Good time to reach out."                   |

### 8B. Message Shortcut: "Analyze with Syncraft"

**File**: `src/slack/shortcuts.ts`

**Registration**: `app.shortcut('analyze_message', handler)`

**Behavior**:

```
1. await ack();
2. Extract message.text, message.user (target), user.id (requester), trigger_id
3. Run intentClassifier on message.text
4. Load target user's profile; if exists, compute availability + reply estimate
5. Open modal via views.open with trigger_id
```

**Modal layout**:

```
┌─────────────────────────────────────────┐
│ Syncraft — Message Analysis                │  ← Modal title
├─────────────────────────────────────────┤
│ 📝 Message Preview                      │
│ "[truncated message, max 200ch]"        │
├─────────────────────────────────────────┤
│ 🔍 Detected Intent                      │
│ ETA / Deadline request                  │
│ "This asks for a timeline..."           │
├─────────────────────────────────────────┤
│ 📍 Recipient Context                    │  (only if profile exists)
│ Local Time: 1:32 AM                     │
│ Status: Likely asleep 💤                │
│ Expected Reply: 6 – 10 hours            │
├─────────────────────────────────────────┤
│                              [ Close ]  │
└─────────────────────────────────────────┘
```

If no target profile: omit Recipient Context, show "No Syncraft profile found for the message author."

### 8C. Message Shortcut: "Suggest Reply with Syncraft"

**File**: `src/slack/shortcuts.ts`

**Registration**: `app.shortcut('suggest_reply', handler)`

**Behavior**:

```
1. await ack();
2. Extract message.text, message.user (sender), user.id (requester), trigger_id
3. Load: senderProfile, senderTraits, requesterTraits, pairTraits, teamTraits
4. Run intentClassifier on message.text
5. Check urgency keywords: "asap", "urgent", "blocking", "eod", "critical", "immediately"
6. Build SuggestionContext
7. Call generateSuggestions(context) → get 2–3 ReplySuggestion objects
8. Open modal with suggestions
```

**Suggestion modal layout**:

```
┌──────────────────────────────────────────────┐
│ 💬 Syncraft — Suggested Replies                 │
├──────────────────────────────────────────────┤
│ 📝 Replying to:                              │
│ "[truncated message, 150ch max]"             │
│ from @sender_name                            │
├──────────────────────────────────────────────┤
│ 📊 Context                                   │
│ • Sender prefers: concise messages, casual   │
│ • They typically ask for: timelines, status  │
│ • Your usual reply time to them: ~45 min     │
│ • Note: "I prefer bullet points" — @sender   │
├──────────────────────────────────────────────┤
│ 💡 Suggestion 1: Direct & concise            │
│ ┌────────────────────────────────────────┐   │
│ │ Hey — ETA is end of week. I'll flag    │   │
│ │ you if anything changes.               │   │
│ └────────────────────────────────────────┘   │
│ Why: Sender prefers short answers.           │
│                           [ 📋 Copy ]        │
├──────────────────────────────────────────────┤
│ 💡 Suggestion 2: Acknowledge + clarify       │
│ ┌────────────────────────────────────────┐   │
│ │ Hey — working on it. Do you need a     │   │
│ │ rough ETA or a firm deadline?           │   │
│ └────────────────────────────────────────┘   │
│ Why: Sender often asks follow-up questions.  │
│                           [ 📋 Copy ]        │
├──────────────────────────────────────────────┤
│                                  [ Close ]   │
└──────────────────────────────────────────────┘
```

**Copy button behavior**: `action_id: copy_suggestion_1`, `copy_suggestion_2`, etc.
On click, send an ephemeral message in the channel containing just the suggestion text so the user can copy-paste it. Slack modals don't support clipboard access.

### 8D. Passive Observer

**File**: `src/slack/observer.ts`

**Registration**: `app.message(handler)` — fires on every message in joined public channels.

```
For each incoming message event:

1. FILTER — skip if:
   - message.subtype exists (edits, joins, bot messages, etc.)
   - message.bot_id exists
   - channel_type !== 'channel' (skip DMs, private channels)
   - sender has no profile OR profile.sharingEnabled === false

2. ANALYZE — call messageAnalyzer.analyzeMessage(text, ...) → MessageObservation
   Also call preferenceDetector.detectPreferences(text) → string[]
   Also call meetingDetector if meeting keywords found

3. STORE — insert observation row into message_observations table
   Update stated_preferences in user_comm_traits if preferences detected
   DO NOT store the message text anywhere.

4. AGGREGATE CHECK — increment per-user counter.
   If counter hits 20 for this user:
     - call aggregateUserTraits(userId)
     - if parent_user_id exists, call aggregatePairTraits(userId, parentUserId)
     - reset counter
   Every 100 observations total, call aggregateTeamTraits.
```

**CRITICAL: Non-blocking.** Wrap the analyze+store+aggregate in a fire-and-forget `Promise`
or `setImmediate`. Do NOT await in the message handler path — Slack requires fast ack.

### 8E. App Home

**File**: `src/slack/appHome.ts`

**Registration**: `app.event('app_home_opened', handler)`

```
1. Load profile for event.user
2. Load user_comm_traits for event.user
3. If profile exists: compute own availability preview
4. Build and publish view
```

**App Home layout**:

```
┌──────────────────────────────────────────┐
│ 👋 Welcome to Syncraft                      │
├──────────────────────────────────────────┤
│ Your Profile                             │
│ Timezone: Asia/Kolkata                   │
│ Work Hours: 10:00 – 18:00               │
│ Sleep Hours: 23:30 – 07:30              │
│ Role: Engineer                           │
│ Response Speed: medium                   │
│ Sharing: Enabled                         │
├──────────────────────────────────────────┤
│ [ ✏️ Edit Profile ]                      │
├──────────────────────────────────────────┤
│ 👀 What others see right now             │
│ Local Time: 3:15 PM                      │
│ Status: Available ✅                      │
│ Expected Reply: 1 – 3 hours             │
├──────────────────────────────────────────┤
│ 🧠 Your Communication Style             │
│ Based on 142 messages observed           │
│                                          │
│ Message style: Concise & casual          │
│ Avg length: ~22 words (terse)            │
│ Uses emoji: Yes                          │
│ Uses greetings: No                       │
│ Formality: Casual                        │
│ Prefers threads: Yes                     │
│ Peak hours: 9–11 AM, 2–4 PM             │
│ Avg reply time: ~18 min                  │
│ Meeting style: Proposes specific times   │
│                                          │
│ Noted preferences:                       │
│ • "I prefer bullet points"              │
│ • "don't tag me in #general"            │
│                                          │
│ [ 🔄 Refresh Traits ] [ 🗑️ Clear My Data ] │
├──────────────────────────────────────────┤
│ ℹ️ Syncraft only observes public channels.  │
│ No message text is stored — only         │
│ patterns like length and timing.         │
└──────────────────────────────────────────┘
```

**If no profile**: show welcome + "Set Up Profile" button only.
**If profile but < 10 observations**: show "Still learning your communication style..." instead of traits.

### 8F. Edit Profile Modal

**File**: `src/slack/modals.ts`

**Two registrations**:
1. `app.action('open_edit_profile_modal', handler)` — opens modal
2. `app.view('edit_profile_submit', handler)` — handles submission

**Modal fields**:

| Field           | Block Kit Element         | Options / Format                        |
|-----------------|---------------------------|-----------------------------------------|
| Timezone        | static_select             | Top ~20 IANA timezones                  |
| Work Start      | timepicker                | Default: 09:00                          |
| Work End        | timepicker                | Default: 17:00                          |
| Sleep Start     | timepicker                | Default: 23:00                          |
| Sleep End       | timepicker                | Default: 07:00                          |
| Role            | plain_text_input          | Max 50 chars                            |
| Response Speed  | static_select             | Fast, Medium, Slow                      |

**Timezone options** (minimum set):
```
America/Los_Angeles, America/Denver, America/Chicago, America/New_York,
America/Sao_Paulo, Europe/London, Europe/Paris, Europe/Berlin,
Europe/Istanbul, Asia/Dubai, Asia/Kolkata, Asia/Bangkok,
Asia/Singapore, Asia/Shanghai, Asia/Tokyo, Asia/Seoul,
Australia/Sydney, Pacific/Auckland
```

**On submission**:
```
1. Extract values from view.state.values (keyed by block_id → action_id)
2. Look up display name: client.users.info({ user: body.user.id })
3. Upsert profile
4. await ack()
5. Re-publish App Home
```

**IMPORTANT**: Pre-fill all fields with current values when editing existing profile.

### 8G. Privacy Actions

**File**: `src/slack/modals.ts` (or appHome.ts)

**Registration**: `app.action('clear_my_data', handler)`

```
1. DELETE FROM message_observations WHERE slack_user_id = ?
2. DELETE FROM user_comm_traits WHERE slack_user_id = ?
3. DELETE FROM pair_comm_traits WHERE user_a = ? OR user_b = ?
4. Refresh App Home with empty traits state
5. Respond ephemeral: "All communication data cleared. Your profile is unchanged."
```

**Registration**: `app.action('refresh_traits', handler)`
```
1. Call aggregateUserTraits(userId) — force recompute
2. Refresh App Home
```

---

## 9. Block Kit Builders

**File**: `src/slack/blocks.ts`

Export pure functions. No side effects. Return Block Kit JSON arrays.

```typescript
function buildAvailabilityBlocks(profile: SyncraftProfile, availability: AvailabilityResult, replyEstimate: string, traits?: UserCommTraits): KnownBlock[];
function buildAppHomeBlocks(profile: SyncraftProfile | null, selfAvailability?: AvailabilityResult, selfReplyEstimate?: string, traits?: UserCommTraits): KnownBlock[];
function buildEditProfileModal(existingProfile?: SyncraftProfile): ModalView;
function buildAnalysisModal(messageText: string, intent: IntentResult, targetProfile?: SyncraftProfile, availability?: AvailabilityResult, replyEstimate?: string): ModalView;
function buildSuggestionModal(messageText: string, senderName: string, suggestions: ReplySuggestion[], contextSummary: string[]): ModalView;
function buildTraitDisplayBlocks(traits: UserCommTraits): KnownBlock[];
```

**Block ID / Action ID reference**:

| Purpose                  | block_id                | action_id                  |
|--------------------------|-------------------------|----------------------------|
| Edit profile button      | `edit_profile_btn`      | `open_edit_profile_modal`  |
| Timezone select          | `timezone_block`        | `timezone_input`           |
| Work start picker        | `work_start_block`      | `work_start_input`         |
| Work end picker          | `work_end_block`        | `work_end_input`           |
| Sleep start picker       | `sleep_start_block`     | `sleep_start_input`        |
| Sleep end picker         | `sleep_end_block`       | `sleep_end_input`          |
| Role input               | `role_block`            | `role_input`               |
| Response speed select    | `speed_block`           | `speed_input`              |
| Copy suggestion 1        | `suggestion_1`          | `copy_suggestion_1`        |
| Copy suggestion 2        | `suggestion_2`          | `copy_suggestion_2`        |
| Copy suggestion 3        | `suggestion_3`          | `copy_suggestion_3`        |
| Refresh traits           | `refresh_traits_btn`    | `refresh_traits`           |
| Clear my data            | `clear_data_btn`        | `clear_my_data`            |
| Modal callbacks          | —                       | `edit_profile_submit`      |

---

## 10. App Entry Point

**File**: `src/app.ts`

```typescript
// Pseudocode — agent should implement fully

import { App } from '@slack/bolt';
import { initDb } from './db/client';
import { registerCommand } from './slack/commands';
import { registerShortcuts } from './slack/shortcuts';
import { registerAppHome } from './slack/appHome';
import { registerModals } from './slack/modals';
import { registerObserver } from './slack/observer';
import config from './config';

const app = new App({
  token: config.SLACK_BOT_TOKEN,
  appToken: config.SLACK_APP_TOKEN,
  signingSecret: config.SLACK_SIGNING_SECRET,
  socketMode: true,
});

initDb();                  // Creates all tables, runs cleanup
registerCommand(app);      // /syncraft @user, /syncraft reply
registerShortcuts(app);    // analyze_message, suggest_reply
registerAppHome(app);      // app_home_opened
registerModals(app);       // modal open + submit + privacy actions
registerObserver(app);     // passive message listener

(async () => {
  await app.start();
  console.log('⚡ Syncraft is running');
})();
```

---

## 11. UX & Copy Rules

1. **Every response is ephemeral.** Only the requester sees it. Never post publicly.
2. **Keep text short.** No paragraphs. Use fields and compact blocks.
3. **Show context, not judgment.** Say "Likely asleep" not "They're ignoring you."
4. **Never expose private data.** No message history, no tracking language.
5. **Avoid creepy wording.** Never: "we tracked", "you were inactive", "we noticed".
6. **Status emoji mapping**: available → ✅, outside_work_hours → 🌙, likely_asleep → 💤
7. **Tone**: Calm, professional, helpful. Like a considerate teammate.
8. **Trait language**: Say "communication style" not "behavior profile". Say "observed patterns" not "tracking data". Say "noted preferences" not "captured statements".
9. **Privacy footer**: Always include the privacy note on App Home: "Syncraft only observes public channels. No message text is stored — only patterns like length and timing."

---

## 12. Error Handling

| Scenario                              | Response                                                     |
|---------------------------------------|--------------------------------------------------------------|
| No user mentioned in `/syncraft`         | Usage hint with both commands                                |
| User not found in workspace           | "Couldn't find that user in this workspace."                  |
| No profile for target user            | "No Syncraft profile found for this user yet."                   |
| Sharing disabled                      | "This user has chosen not to share their availability."       |
| Invalid timezone in profile           | Fall back to UTC, log warning                                 |
| DB error                              | Log error, respond: "Something went wrong. Try again shortly."|
| Shortcut message text empty           | "No message text found to analyze."                           |
| `/syncraft reply` outside a thread       | "Use `/syncraft reply` inside a thread to get suggestions."      |
| Suggest reply, < 10 sender observations | Show suggestions based on intent only, note "Still learning..." |
| Observer fails on a message           | Log warning silently, do not surface errors to any user        |

---

## 13. Privacy Model

### Principles

- Observe public channels only. Never DMs. Never private channels.
- Never store raw message text. Only store derived metadata.
- Users must have `sharing_enabled = true` to be observed.
- Users can view their own traits and clear their data at any time.
- Trait data shown about others is always in the context of helping communication, never surveillance.

### User Controls

| Action            | Method                                    |
|-------------------|-------------------------------------------|
| Stop observation  | Set `sharing_enabled = false` in profile  |
| View own traits   | App Home → "Your Communication Style"     |
| Clear own data    | App Home → "Clear My Data" button         |
| View stated prefs | App Home → listed under traits            |

---

## 14. README Template

The agent should generate a README.md covering:

```markdown
# Syncraft — Slack Communication Assistant (Prototype)

## What It Does
Syncraft helps remote teammates communicate more effectively by surfacing availability
context and learned communication preferences. It suggests replies tailored to how
each person prefers to communicate.

## Prerequisites
- Node.js >= 18
- A Slack workspace where you can install apps
- A Slack app created at https://api.slack.com/apps

## Slack App Setup
1. Create new app → "From scratch"
2. Enable Socket Mode → generate App-Level Token with `connections:write`
3. OAuth & Permissions → add Bot Token Scopes:
   `commands`, `chat:write`, `users:read`, `channels:history`, `channels:read`
4. Install to workspace → copy Bot Token
5. Create slash command: `/syncraft`
6. Create message shortcuts:
   - callback_id: `analyze_message`, name: "Analyze with Syncraft"
   - callback_id: `suggest_reply`, name: "Suggest Reply with Syncraft"
7. Enable App Home → Home Tab
8. Subscribe to bot events: `app_home_opened`, `message.channels`
9. Copy Signing Secret from Basic Information

## Local Setup
1. Clone repo
2. `npm install`
3. Copy `.env.example` to `.env`, fill in tokens
4. `npx tsx src/app.ts`
5. Open Slack → test `/syncraft @yourself`

## How It Works
- **/syncraft @user**: Shows availability, timezone, reply estimate, and communication style
- **"Analyze with Syncraft"**: Right-click a message to analyze its intent
- **"Suggest Reply with Syncraft"**: Right-click a message to get tailored reply suggestions
- **App Home**: View/edit your profile and see your learned communication style
- **Passive learning**: Syncraft observes public channels to learn communication patterns
  (metadata only — no message text is stored)

## Privacy
- Only public channels are observed
- No message text is ever stored — only derived metadata (word count, timing, intent)
- Users can view and clear their data from the App Home
- Set sharing_enabled to false in your profile to opt out

## Testing Checklist
- [ ] `/syncraft @user` with existing profile
- [ ] `/syncraft @user` with no profile
- [ ] `/syncraft` with no argument
- [ ] `/syncraft reply` in a thread
- [ ] Open App Home → see welcome or profile
- [ ] Set up / edit profile via modal
- [ ] "Analyze with Syncraft" shortcut on a message
- [ ] "Suggest Reply with Syncraft" shortcut on a message
- [ ] Verify communication style appears after ~20 messages
- [ ] Clear My Data from App Home
```

---

## 15. Testing Scenarios

| #  | Action                                           | Expected                                         |
|----|--------------------------------------------------|--------------------------------------------------|
| 1  | `/syncraft` (no arg)                                | Usage hint with both commands                    |
| 2  | `/syncraft @self` (no profile)                      | "No profile" message                             |
| 3  | Set up profile via App Home modal                | Profile saved, App Home refreshes                |
| 4  | `/syncraft @self` (with profile)                    | Shows status, time, reply estimate               |
| 5  | Change timezone, re-check                        | Local time updates                               |
| 6  | Shortcut "Analyze" on "when will this be done?"  | Intent: eta_request + suggestion                 |
| 7  | Shortcut "Analyze" on "any updates?"             | Intent: status_check                             |
| 8  | Shortcut "Analyze" on "hi there"                 | Intent: general                                  |
| 9  | Send ~25 messages in a public channel            | message_observations table populates             |
| 10 | Check App Home after 25+ messages                | "Your Communication Style" section appears       |
| 11 | Shortcut "Suggest Reply" on an eta_request       | Modal with 2–3 tailored suggestions              |
| 12 | Shortcut "Suggest Reply" with thin data (<10)    | "Still learning..." with intent-only suggestions |
| 13 | `/syncraft reply` in a thread                       | Suggestion modal opens                           |
| 14 | `/syncraft reply` NOT in a thread                   | Error: "Use in a thread"                         |
| 15 | Click "Clear My Data" on App Home                | Data deleted, traits section resets              |
| 16 | `/syncraft @user` shows traits section              | Communication style info included                |
| 17 | Set sharing_enabled = false, send messages       | Observer skips this user's messages              |

---

## 16. Build Order

Execute in this order. Each phase should be testable before moving to the next.

```
PHASE 1 — Foundation
  1. Initialize project: package.json, tsconfig.json, .env.example, .gitignore
  2. src/config.ts — load and validate env vars via dotenv
  3. src/types/index.ts — ALL types (profile, availability, intent, traits, observations, suggestions)
  4. src/db/client.ts — init SQLite, create ALL 5 tables, run 30-day cleanup
  5. src/db/profileRepo.ts — getProfile, upsertProfile
  6. src/db/observationRepo.ts — insertObservation, getObservationsForUser, getObservationsForPair, getRecentObservationCount
  7. src/db/commTraitsRepo.ts — getUserTraits, upsertUserTraits, getPairTraits, upsertPairTraits, getTeamTraits, upsertTeamTraits, deleteUserData
  8. src/app.ts — minimal Bolt app, starts, logs "running"
  → TEST: app starts without errors, tables are created

PHASE 2 — Core Services
  9. src/utils/time.ts — parseTimeToMinutes, isInWrappingRange, formatLocalTime
  10. src/services/availabilityService.ts — getAvailability
  11. src/services/replyEstimateService.ts — getReplyEstimate
  12. src/services/intentClassifier.ts — classifyIntent
  → TEST: manually verify service logic with test data

PHASE 3 — Slash Command (Lookup)
  13. src/slack/blocks.ts — buildAvailabilityBlocks (include optional traits section)
  14. src/slack/commands.ts — /syncraft @user handler
  → TEST: /syncraft with and without profiles in Slack

PHASE 4 — App Home + Profile Modal
  15. src/slack/blocks.ts — add buildAppHomeBlocks, buildEditProfileModal
  16. src/slack/appHome.ts — app_home_opened handler
  17. src/slack/modals.ts — modal open + submission handler
  → TEST: full profile create/edit flow in Slack

PHASE 5 — Message Analysis Shortcut
  18. src/slack/blocks.ts — add buildAnalysisModal
  19. src/slack/shortcuts.ts — analyze_message handler
  → TEST: analyze various messages in Slack

PHASE 6 — Observation Pipeline
  20. src/services/messageAnalyzer.ts — extract metadata from single message
  21. src/services/preferenceDetector.ts — extract stated preferences
  22. src/services/meetingDetector.ts — classify meeting patterns
  23. src/slack/observer.ts — passive listener, wires up analyzer + storage
  → TEST: send messages in public channel, verify observations table populates

PHASE 7 — Trait Aggregation
  24. src/services/traitAggregator.ts — aggregateUserTraits, aggregatePairTraits, aggregateTeamTraits
  25. Hook aggregation into observer (trigger every 20 messages per user)
  → TEST: after ~25 messages, verify user_comm_traits populates

PHASE 8 — Reply Suggestions
  26. src/services/replySuggestionService.ts — core suggestion engine
  27. src/slack/blocks.ts — add buildSuggestionModal
  28. src/slack/shortcuts.ts — add suggest_reply handler
  29. src/slack/commands.ts — add /syncraft reply sub-command
  → TEST: invoke suggestions on various message types, verify modal

PHASE 9 — App Home: Traits + Privacy
  30. Update src/slack/blocks.ts — add buildTraitDisplayBlocks
  31. Update src/slack/appHome.ts — add communication style section + privacy footer
  32. Register clear_my_data and refresh_traits actions
  → TEST: view own style, clear data, verify deletion

PHASE 10 — Polish
  33. Graceful degradation: thin data fallbacks everywhere
  34. Error handling sweep (all cases from §12)
  35. Edge cases: deleted users, empty channels, attachment-only messages
  36. README.md
  → TEST: run full scenario checklist from §15
```

---

## 17. Constraints & Reminders for the Agent

- **No LLM/ML API calls.** All logic is rule-based keyword matching + templates.
- **No web server.** Socket Mode handles everything.
- **Use synchronous `better-sqlite3` API.** No async DB needed.
- **All Slack responses must be ephemeral** (visible only to requester).
- **Never store raw message text.** Extract metadata in memory, discard text.
- **Observe public channels only.** Never DMs, never private channels.
- **Pre-fill modal fields** when editing an existing profile.
- **Validate timezone** before saving — use `luxon`'s `IANAZone.isValidZone()`.
- **Handle the midnight-wrap** in sleep window calculations (see §7A).
- **Slack encodes mentions as `<@U1234ABCD>`** in command text — parse with regex.
- **Acknowledge all interactions immediately** — call `ack()` first in every handler.
- **Keep the DB file** in project root as `syncraft.db`. Add to `.gitignore`.
- **Use `tsx` for development** — run with `npx tsx src/app.ts`.
- **Pair dedup**: Always store pairs with lexicographically smaller user ID as `user_a`.
- **Aggregation is lazy.** Trigger every 20 observations per user, not on every message.
- **Graceful degradation.** If < 10 observations: "Still learning..." + intent-only suggestions.
- **Observer must be non-blocking.** Fire-and-forget or microtask queue — never await heavy ops in the message handler.
- **Templates, not AI.** Reply suggestions are composed from templates, not generated text.
