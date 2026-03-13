const PREFERENCE_TRIGGERS = [
  'i prefer',
  "please don't",
  "don't ",
  "i'd rather",
  "can you not",
  "can you please",
  "i like when",
  "it would be better if",
  "for future reference",
  "fyi i",
  "just so you know",
  "my preference is",
  "heads up i",
];

export function detectPreferences(text: string): string[] {
  const lower = text.toLowerCase();
  const results: string[] = [];

  for (const trigger of PREFERENCE_TRIGGERS) {
    if (lower.includes(trigger)) {
      // Extract the sentence containing the trigger
      const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
      for (const sentence of sentences) {
        if (sentence.toLowerCase().includes(trigger) && !results.includes(sentence)) {
          results.push(sentence);
        }
      }
    }
  }

  return results;
}
