import { MessageObservation, IntentType } from '../types';
import { classifyIntent } from './intentClassifier';
import { tsToDateTimeInZone } from '../utils/time';

const GREETING_WORDS = ['hi', 'hey', 'hello', 'good morning', 'good afternoon', 'morning', 'evening'];
const SIGNOFF_WORDS = ['thanks', 'thank you', 'cheers', 'best', 'regards', 'ty', 'thx'];
const SLANG_WORDS = ['u', 'thx', 'lol', 'idk', 'lmk', 'nvm', 'tbh'];
const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]|:[a-z_]+:/gu;

export function analyzeMessage(
  text: string,
  slackUserId: string,
  channelId: string,
  threadTs: string | null,
  parentUserId: string | null,
  messageTs: string,
  userTimezone: string | null,
): MessageObservation {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const lower = text.toLowerCase();

  // hasGreeting: first 3 words match greeting
  const firstThreeWords = words.slice(0, 3).join(' ').toLowerCase();
  const hasGreeting = GREETING_WORDS.some(g => firstThreeWords.includes(g));

  // hasSignoff: last 5 words
  const lastFiveWords = words.slice(-5).join(' ').toLowerCase();
  const hasSignoff = SIGNOFF_WORDS.some(s => lastFiveWords.includes(s));

  // hasEmoji
  const hasEmoji = EMOJI_REGEX.test(text);
  EMOJI_REGEX.lastIndex = 0; // reset stateful regex

  // formalityScore
  let formalityScore = 0;
  if (text.length > 0 && text[0] === text[0].toUpperCase() && text[0] !== text[0].toLowerCase()) formalityScore += 1;
  if (text.trimEnd().endsWith('.')) formalityScore += 1;
  if (text === text.toLowerCase() && text.trim().length > 0) formalityScore -= 1;
  if (SLANG_WORDS.some(slang => lower.split(/\s+/).includes(slang))) formalityScore -= 1;
  formalityScore = Math.max(-2, Math.min(2, formalityScore));

  // detectedIntent
  const detectedIntent: IntentType = classifyIntent(text).intent;

  // isQuestion
  const isQuestion = text.includes('?') && wordCount < 30;

  // isThreadReply
  const isThreadReply = threadTs !== null && threadTs !== messageTs;

  // Timestamps
  const dt = tsToDateTimeInZone(messageTs, userTimezone);
  const isWeekend = dt.weekday === 6 || dt.weekday === 7; // Luxon: 1=Mon, 7=Sun
  const hourLocal = dt.hour;
  const timestampUtc = dt.toUTC().toISO() ?? new Date().toISOString();

  return {
    slackUserId,
    channelId,
    threadTs,
    parentUserId,
    wordCount,
    hasGreeting,
    hasSignoff,
    hasEmoji,
    formalityScore,
    detectedIntent,
    isQuestion,
    isThreadReply,
    isWeekend,
    hourLocal,
    timestampUtc,
  };
}
