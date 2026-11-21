const count = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const money = (value) => Number(Number(value || 0).toFixed(6));
const credits = (yuan) => Math.max(0, Math.ceil(yuan * 10_000 - 1e-9)) / 100;

// Only explicit modality counts are billable. Image bytes/base64 and reference
// counts are never interpreted as actual image token usage.
export function normalizeImageInputUsage(payload = {}) {
  const usage = payload.usage || {};
  const details = usage.input_tokens_details || usage.prompt_tokens_details || {};
  let textTokens = count(details.text_tokens);
  let referenceTokens = count(details.image_tokens);
  const metadata = payload.usageMetadata;
  if (metadata?.promptTokensDetails?.length) {
    const byModality = (modality) => {
      const rows = metadata.promptTokensDetails.filter((row) => row.modality === modality);
      return rows.length && rows.every((row) => count(row.tokenCount) !== null)
        ? rows.reduce((sum, row) => sum + row.tokenCount, 0) : null;
    };
    textTokens ??= byModality('TEXT');
    referenceTokens ??= byModality('IMAGE');
  }
  return {
    textTokens, referenceTokens,
    inputTokens: count(usage.input_tokens) ?? count(usage.prompt_tokens) ?? count(metadata?.promptTokenCount),
    outputTokens: count(usage.output_tokens) ?? count(usage.completion_tokens) ?? count(metadata?.candidatesTokenCount)
  };
}

export function imageInputFees({ prompt = '', estimatedTextTokens, referenceCount = 0, usage = null } = {}, config = {}) {
  const rule = config.upstreamCost;
  const textEnabled = config.chargeTextTokens === true;
  const referenceEnabled = config.chargeReferenceTokens === true;
  const textRate = Number(rule?.imageTextInputRmb ?? rule?.pricing?.input ?? 0);
  const referenceRate = Number(rule?.imageInput ?? rule?.pricing?.input ?? 0);
  const references = Math.max(0, Math.min(9, Math.round(Number(referenceCount) || 0)));
  const actual = usage !== null;
  // The server estimates text as ceil((English words + Han characters) * 0.75).
  // Final charges use reported usage only; excess over the reservation is waived.
  if (!actual && textEnabled && prompt && !(count(estimatedTextTokens) > 0)) {
    throw Object.assign(new Error('TEXT_TOKEN_ESTIMATE_REQUIRED'), { code: 'TEXT_TOKEN_ESTIMATE_REQUIRED' });
  }
  const textTokens = actual ? count(usage.textTokens) ?? (references === 0 ? count(usage.inputTokens) : null)
    : (textEnabled && prompt ? estimatedTextTokens : 0);
  const referenceTokens = actual ? (references ? count(usage.referenceTokens) : 0)
    : references * Math.max(1, Number(rule?.referenceTokenBudget) || 4096);
  const textRmb = textEnabled && textTokens > 0 ? textTokens * textRate / 1_000_000 : 0;
  const referenceRmb = referenceEnabled && referenceTokens > 0 ? referenceTokens * referenceRate / 1_000_000 : 0;
  // Text fees at or below 0.5 credits are waived, without changing the
  // upstream cost record or the separately billed reference-image fee.
  const textCredits = textRmb * 100 > 0.5 ? credits(textRmb) : 0;
  return {
    imageTextEnabled: textEnabled, referenceTokenEnabled: referenceEnabled,
    imageTextTokens: textEnabled ? textTokens : 0,
    referenceTokens: referenceEnabled ? referenceTokens : 0,
    imageTextInputRmb: textRate, referenceTokenInputRmb: referenceRate,
    imageTextCredits: textCredits, referenceTokenCredits: credits(referenceRmb),
    imageTextCostRmb: money(textRmb), referenceTokenCostRmb: money(referenceRmb),
    inputTokenBillingMode: actual ? 'actual' : 'reservation-budget',
    missingTextUsage: actual && textEnabled && textTokens === null,
    missingReferenceUsage: actual && referenceEnabled && references > 0 && referenceTokens === null
  };
}

export function settleImageInputPricing(quoted, usage) {
  if (!quoted.imageTextEnabled && !quoted.referenceTokenEnabled) return { ...quoted, waivedOverageCredits: 0 };
  const input = imageInputFees({ referenceCount: quoted.referenceCount, usage: usage || {} }, {
    chargeTextTokens: quoted.imageTextEnabled, chargeReferenceTokens: quoted.referenceTokenEnabled,
    upstreamCost: { imageTextInputRmb: quoted.imageTextInputRmb, imageInput: quoted.referenceTokenInputRmb }
  });
  const actualInput = Number((input.imageTextCredits + input.referenceTokenCredits).toFixed(2));
  // Keep the two reservation buckets separate: a waived text fee must not
  // consume the reference-image reservation when actual text usage is higher.
  const chargedText = Math.min(input.imageTextCredits, quoted.imageTextCredits || 0);
  const chargedReference = Math.min(input.referenceTokenCredits, quoted.referenceTokenCredits || 0);
  const chargedInput = Number((chargedText + chargedReference).toFixed(2));
  const finalCredits = Number((quoted.imageCredits + chargedInput).toFixed(2));
  const outputCost = quoted.upstreamFixedPriceRmb ?? (count(usage?.outputTokens) !== null
    ? usage.outputTokens * quoted.upstreamOutputRmbPerMillion / 1_000_000 : null);
  return {
    ...quoted, ...input, credits: finalCredits, retailRmb: finalCredits / 100,
    actualImageTextCredits: input.imageTextCredits, actualReferenceTokenCredits: input.referenceTokenCredits,
    imageTextCredits: chargedText, referenceTokenCredits: chargedReference,
    inputTokenChargedCredits: chargedInput,
    waivedOverageCredits: Number((actualInput - chargedInput).toFixed(2)),
    actualUpstreamCostRmb: outputCost === null || input.imageTextTokens === null || input.referenceTokens === null ? null
      : money(outputCost + (Number(usage?.textTokens || 0) * quoted.imageTextInputRmb
        + Number(usage?.referenceTokens || 0) * quoted.referenceTokenInputRmb) / 1_000_000),
    quotedCredits: quoted.credits
  };
}
