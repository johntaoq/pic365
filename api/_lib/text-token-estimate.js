// A deliberately simple text-only estimate for quotes. This is not a model
// tokenizer: final charges use the provider's reported token usage.
export function estimateTextTokens(text) {
  const value = String(text || '');
  if (!value.trim()) return 0;
  const englishWords = value.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)?.length || 0;
  const chineseCharacters = value.match(/\p{Script=Han}/gu)?.length || 0;
  return Math.max(1, Math.ceil((englishWords + chineseCharacters) * 0.75));
}
