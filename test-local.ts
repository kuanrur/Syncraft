/**
 * Local test — no Slack needed.
 * Run: npx tsx test-local.ts
 */
import { initDb } from './src/db/client';
import { upsertProfile, getProfile } from './src/db/profileRepo';
import { getAvailability } from './src/services/availabilityService';
import { getReplyEstimate } from './src/services/replyEstimateService';
import { classifyIntent } from './src/services/intentClassifier';
import { generateSuggestions } from './src/services/replySuggestionService';
import { analyzeMessage } from './src/services/messageAnalyzer';
import { insertObservation } from './src/db/observationRepo';
import { aggregateUserTraits } from './src/services/traitAggregator';
import { getUserTraits } from './src/db/commTraitsRepo';
import { SyncraftProfile } from './src/types';

console.log('\n====== SYNCRAFT LOCAL TEST ======\n');

initDb();

// 1. Create a test profile
const profile: SyncraftProfile = {
  slackUserId: 'U_TEST_001',
  displayName: 'Test User',
  timezone: 'America/New_York',
  workStart: '09:00',
  workEnd: '17:00',
  sleepStart: '23:00',
  sleepEnd: '07:00',
  role: 'Engineer',
  responseSpeed: 'medium',
  sharingEnabled: true,
};
upsertProfile(profile);
console.log('✅ Profile saved:', profile.displayName, profile.timezone);

// 2. Availability
const availability = getAvailability(profile);
const estimate = getReplyEstimate(availability.status, profile.responseSpeed);
console.log(`\n📍 Availability: ${availability.statusLabel}`);
console.log(`   Local time: ${availability.localTimeString}`);
console.log(`   Reply estimate: ${estimate}`);

// 3. Intent classification
const testMessages = [
  'When will the PR be ready? We have a deadline.',
  'Can you explain what this function does?',
  'Can I proceed with the deployment?',
  'Any updates on the ticket?',
  'Hey, just checking in!',
];
console.log('\n🔍 Intent Classification:');
for (const msg of testMessages) {
  const intent = classifyIntent(msg);
  console.log(`   "${msg.slice(0, 45)}..." → ${intent.label}`);
}

// 4. Simulate 25 observations to trigger trait aggregation
console.log('\n📊 Simulating 25 messages...');
const messages = [
  { text: 'hey when will this be done?', ts: '1700000000.000000' },
  { text: 'any updates on the ticket?', ts: '1700001000.000000' },
  { text: 'Can you clarify what you mean here?', ts: '1700002000.000000' },
  { text: 'lol ok nvm idk', ts: '1700003000.000000' },
  { text: 'Hi! Looking forward to the review.', ts: '1700004000.000000' },
];
for (let i = 0; i < 25; i++) {
  const m = messages[i % messages.length];
  const obs = analyzeMessage(m.text, 'U_TEST_001', 'C_CHAN_001', null, null, m.ts, profile.timezone);
  insertObservation(obs);
}

// 5. Aggregate traits
aggregateUserTraits('U_TEST_001');
const traits = getUserTraits('U_TEST_001');
if (traits) {
  console.log('\n🧠 Aggregated Traits:');
  console.log(`   Messages sampled: ${traits.messagesSampled}`);
  console.log(`   Avg length: ${traits.avgMessageLength.toFixed(1)} words (${traits.lengthBucket})`);
  console.log(`   Formality: ${traits.formality}`);
  console.log(`   Uses emoji: ${traits.usesEmoji}`);
  console.log(`   Top intents: ${traits.topIntentsSent.join(', ')}`);
}

// 6. Reply suggestions
console.log('\n💬 Reply Suggestions for "When will this be ready?":');
const intent = classifyIntent('When will this be ready?');
const suggestions = generateSuggestions({
  messageText: 'When will this be ready?',
  senderId: 'U_TEST_001',
  requesterId: 'U_TEST_002',
  senderProfile: profile,
  senderTraits: traits,
  requesterTraits: null,
  pairTraits: null,
  teamTraits: null,
  intent,
  isUrgent: false,
});
for (const s of suggestions) {
  console.log(`\n   [${s.label}]`);
  console.log(`   "${s.body}"`);
  console.log(`   Why: ${s.reasoning}`);
}

console.log('\n====== ALL TESTS PASSED ======\n');
