export function referenceImageAliases(number = 1, language = 'zh') {
  const index = Math.max(1, Math.round(Number(number) || 1));
  if (language === 'zh') {
    return index === 1
      ? ['参考图1', '图1', '主图', '母版']
      : [`参考图${index}`, `图${index}`];
  }
  return index === 1
    ? ['Reference 1', 'Image 1', 'Primary image', 'Master']
    : [`Reference ${index}`, `Image ${index}`];
}

export function referenceImageAliasText(number = 1, language = 'zh') {
  return referenceImageAliases(number, language).join(' / ');
}

export function referenceImageDisplayLabel(number = 1, language = 'zh') {
  const index = Math.max(1, Math.round(Number(number) || 1));
  if (language === 'zh') return index === 1 ? '参考图1 · 主图 / 母版' : `参考图${index}`;
  return index === 1 ? 'Reference 1 · Primary / Master' : `Reference ${index}`;
}

export function referenceImageInterpretationRule(language = 'zh') {
  return language === 'zh'
    ? '“参考图N”与“图N”严格按相同编号对应同一张输入图片；“主图”和“母版”固定代表参考图1。'
    : '“Reference N” and “Image N” map to the same numbered input; “Primary image” and “Master” always mean Reference 1.';
}
