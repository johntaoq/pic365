export const IMAGE_QUALITY_VALUES = ['auto', 'low', 'medium', 'high'];

const IMAGE_QUALITY_LABELS = {
  zh: {
    auto: '自动',
    low: '低',
    medium: '中等',
    high: '高'
  },
  en: {
    auto: 'Auto',
    low: 'Low',
    medium: 'Medium',
    high: 'High'
  }
};

export function imageQualityLabel(value, language = 'en') {
  const normalizedLanguage = language === 'zh' ? 'zh' : 'en';
  const normalizedValue = String(value || '').trim().toLowerCase();
  return IMAGE_QUALITY_LABELS[normalizedLanguage][normalizedValue] || normalizedValue;
}
