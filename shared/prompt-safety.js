const REPLACEMENTS = [
  {
    pattern: /\b(?:minor|underage|teen(?:age)?|schoolgirl|schoolboy|child|kid|girl|boy)\b/gi,
    value: 'adult subject'
  },
  {
    pattern: /(?:未成年|未成年人|幼女|幼童|儿童|小孩|少女|男孩|女孩)/g,
    value: '成年主体'
  },
  {
    pattern: /\b(?:nude|naked|nudity|porn(?:ography)?|erotic|sexually explicit|explicit sexual|sexualized|fetish|adult content|seductive|provocative)\b/gi,
    value: 'fully clothed, non-sexual styling'
  },
  {
    pattern: /(?:裸体|裸露|色情|性爱|性交|淫荡|猥亵|露骨|性暗示|挑逗|媚态|情色|色情化)/g,
    value: '完整着装、非性化风格'
  },
  {
    pattern: /\b(?:lingerie|underwear)\b/gi,
    value: 'fashion outfit'
  },
  {
    pattern: /\b(?:blood(?:y)?|gore|gory|graphic violence|dismember(?:ed|ment)?|decapitat(?:ed|ion)?|mutilat(?:ed|ion)?|suicide|self-harm|murder|kill(?:ing)?|corpse)\b/gi,
    value: 'non-graphic action'
  },
  {
    pattern: /(?:鲜血|血腥|断肢|肢解|斩首|尸体|自杀|自残|杀人|虐待|酷刑)/g,
    value: '非血腥动作场景'
  },
  {
    pattern: /\b(?:how to|instructions? for|step[- ]by[- ]step|make a bomb|build a weapon|exploit|hack|steal)\b[^.?!。！？]*/gi,
    value: ''
  }
];

const GENERIC_SAFE_PROMPT =
  'Create a polished, family-friendly editorial image with a clearly defined subject, balanced composition, natural lighting, refined colors, realistic materials, natural anatomy, and a clean non-graphic presentation.';

function normalizePrompt(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSafePromptFallback(originalPrompt) {
  const normalized = normalizePrompt(originalPrompt);
  let safeDetails = normalized;
  for (const replacement of REPLACEMENTS) {
    safeDetails = safeDetails.replace(replacement.pattern, replacement.value);
  }
  safeDetails = safeDetails.replace(/\s+/g, ' ').trim();

  if (!safeDetails || safeDetails.length < 8) return GENERIC_SAFE_PROMPT;
  if (safeDetails.length > 1800) safeDetails = safeDetails.slice(0, 1800).trim();

  return [
    'Create a polished, family-friendly image based on these safe creative details:',
    safeDetails,
    'Use adult subjects where people are present, ordinary fully clothed styling, non-sexual posing, natural anatomy, non-graphic presentation, clear composition, tasteful lighting, and refined visual quality.'
  ].join(' ');
}

