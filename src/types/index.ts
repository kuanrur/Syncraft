// ── Profile (manual) ────────────────────────────────

export type ResponseSpeed = 'fast' | 'medium' | 'slow';

export interface XiamiProfile {
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

export interface AvailabilityResult {
  localTimeString: string;
  status: 'available' | 'outside_work_hours' | 'likely_asleep';
  statusLabel: string;
}

// ── Intent ──────────────────────────────────────────

export type IntentType = 'eta_request' | 'clarification' | 'approval' | 'status_check' | 'general';

export interface IntentResult {
  intent: IntentType;
  label: string;
  suggestion: string;
}

// ── Communication Traits (learned) ──────────────────

export type LengthBucket = 'terse' | 'moderate' | 'verbose';
export type Formality = 'casual' | 'mixed' | 'formal';
export type MeetingStyle = 'proposes_specific_time' | 'asks_for_availability' | 'defers_to_other' | 'unknown';

export interface UserCommTraits {
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

export interface PairCommTraits {
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

export interface TeamCommTraits {
  workspaceId: string;
  avgMessageLength: number;
  dominantFormality: Formality;
  commonMeetingPattern: string;
  peakHoursUtc: string[];
  avgResponseTimeMin: number;
  lastUpdated: string;
}

// ── Message Observation (metadata only) ─────────────

export interface MessageObservation {
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

export interface ReplySuggestion {
  label: string;          // e.g. "Direct & concise"
  body: string;           // The suggested reply text
  reasoning: string;      // Why this approach fits
}

export interface SuggestionContext {
  messageText: string;
  senderId: string;
  requesterId: string;
  senderProfile: XiamiProfile | null;
  senderTraits: UserCommTraits | null;
  requesterTraits: UserCommTraits | null;
  pairTraits: PairCommTraits | null;
  teamTraits: TeamCommTraits | null;
  intent: IntentResult;
  isUrgent: boolean;
}
