import sharp from 'sharp';
import {
  getDeliveryTheme,
  normalizeDeliveryAdvanced,
  normalizeDeliveryContent
} from '../../shared/ecommerce-delivery.js';
import { readStoredImage } from './storage.js';

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(value, maxUnits, maxLines = 3) {
  const text = String(value || '').trim();
  if (!text) return [];
  const lines = [];
  let current = '';
  let units = 0;
  const unitFor = (character) => /[\u0000-\u00ff]/.test(character) ? 0.58 : 1;
  for (const character of text) {
    const next = unitFor(character);
    if (current && units + next > maxUnits) {
      lines.push(current.trim());
      current = character;
      units = next;
      if (lines.length >= maxLines) break;
    } else {
      current += character;
      units += next;
    }
  }
  if (lines.length < maxLines && current.trim()) lines.push(current.trim());
  if (lines.length === maxLines && text.length > lines.join('').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.…]+$/, '')}…`;
  }
  return lines;
}

function textBlock(lines, { x, y, fontSize, lineHeight, color, weight = 600, anchor = 'start', maxWidth }) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-family="Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}"${maxWidth ? ` textLength="${Math.min(maxWidth, Math.max(1, line.length) * fontSize)}" lengthAdjust="spacingAndGlyphs"` : ''}>${escapeXml(line)}</text>`
  )).join('');
}

function panelGeometry(document, advanced) {
  const width = document.targetWidth;
  const height = document.targetHeight;
  const padding = Math.round(Math.min(width, height) * advanced.padding);
  const safeWidth = width - padding * 2;
  const safeHeight = height - padding * 2;
  const panelWidth = Math.round(safeWidth * advanced.contentWidth);
  const panelHeight = Math.round(Math.min(safeHeight * 0.46, Math.max(210, height * 0.31)));
  switch (document.layoutId) {
    case 'top-left': return { x: padding, y: padding, width: panelWidth, height: panelHeight, align: 'left' };
    case 'top-center': return { x: Math.round((width - panelWidth) / 2), y: padding, width: panelWidth, height: panelHeight, align: 'center' };
    case 'bottom-center': return { x: Math.round((width - panelWidth) / 2), y: height - padding - panelHeight, width: panelWidth, height: panelHeight, align: 'center' };
    case 'split-left': return { x: padding, y: padding, width: Math.round(safeWidth * 0.42), height: safeHeight, align: 'left' };
    default: return { x: padding, y: height - padding - panelHeight, width: panelWidth, height: panelHeight, align: 'left' };
  }
}

function generalPanelSvg(document, content, advanced, theme) {
  if (!advanced.showText) return '';
  const panel = panelGeometry(document, advanced);
  const inner = Math.round(Math.min(document.targetWidth, document.targetHeight) * 0.035);
  const anchor = panel.align === 'center' ? 'middle' : 'start';
  const textX = panel.align === 'center' ? panel.x + panel.width / 2 : panel.x + inner;
  const headlineSize = Math.max(28, Math.round(Math.min(document.targetWidth, document.targetHeight) * 0.048));
  const subtitleSize = Math.max(16, Math.round(headlineSize * 0.47));
  const bulletSize = Math.max(15, Math.round(headlineSize * 0.43));
  const maxUnits = panel.align === 'center' ? 22 : 27;
  const headlineLines = wrapText(content.headline, maxUnits, 2);
  const subtitleLines = wrapText(content.subtitle, maxUnits * 1.4, 2);
  const badgeWidth = content.badge ? Math.max(90, content.badge.length * bulletSize * 0.9 + inner) : 0;
  let cursorY = panel.y + inner + headlineSize;
  let svg = `<rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="${Math.round(inner * 0.72)}" fill="${theme.panel}" fill-opacity="${advanced.overlayOpacity}" stroke="${theme.line}" stroke-width="2"/>`;
  if (content.badge) {
    const badgeX = panel.align === 'center' ? panel.x + (panel.width - badgeWidth) / 2 : panel.x + inner;
    svg += `<rect x="${badgeX}" y="${panel.y + inner}" width="${badgeWidth}" height="${bulletSize * 2.05}" rx="${bulletSize}" fill="${theme.accent}"/>`;
    svg += `<text x="${badgeX + badgeWidth / 2}" y="${panel.y + inner + bulletSize * 1.38}" fill="${theme.foreground}" font-family="Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif" font-size="${bulletSize}" font-weight="800" text-anchor="middle">${escapeXml(content.badge)}</text>`;
    cursorY += bulletSize * 2.05;
  }
  svg += textBlock(headlineLines, { x: textX, y: cursorY, fontSize: headlineSize, lineHeight: headlineSize * 1.18, color: theme.foreground, weight: 850, anchor });
  cursorY += headlineLines.length * headlineSize * 1.18 + subtitleSize * 0.7;
  if (subtitleLines.length) {
    svg += textBlock(subtitleLines, { x: textX, y: cursorY, fontSize: subtitleSize, lineHeight: subtitleSize * 1.35, color: theme.muted, weight: 600, anchor });
    cursorY += subtitleLines.length * subtitleSize * 1.35 + subtitleSize * 0.65;
  }
  const bullets = content.bullets.slice(0, panel.height > document.targetHeight * 0.6 ? 5 : 3);
  for (const bullet of bullets) {
    if (cursorY > panel.y + panel.height - inner * 1.2) break;
    const bulletX = panel.align === 'center' ? textX - panel.width * 0.33 : textX;
    svg += `<circle cx="${bulletX}" cy="${cursorY - bulletSize * 0.18}" r="${Math.max(3, bulletSize * 0.18)}" fill="${theme.accent}"/>`;
    svg += textBlock(wrapText(bullet, 34, 1), { x: bulletX + bulletSize * 0.8, y: cursorY, fontSize: bulletSize, lineHeight: bulletSize * 1.3, color: theme.foreground, weight: 650 });
    cursorY += bulletSize * 1.55;
  }
  if (content.price) {
    const priceSize = Math.round(headlineSize * 0.88);
    const priceX = panel.align === 'center' ? textX : panel.x + panel.width - inner;
    const priceAnchor = panel.align === 'center' ? 'middle' : 'end';
    svg += `<text x="${priceX}" y="${panel.y + panel.height - inner}" fill="${theme.accent}" font-family="Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif" font-size="${priceSize}" font-weight="900" text-anchor="${priceAnchor}">${escapeXml(content.price)}</text>`;
  }
  return svg;
}

function dimensionsSvg(document, content, theme) {
  const width = document.targetWidth;
  const height = document.targetHeight;
  const margin = Math.round(Math.min(width, height) * 0.075);
  const fontSize = Math.max(20, Math.round(Math.min(width, height) * 0.028));
  const horizontal = content.dimensions.width || content.dimensions.depth;
  const vertical = content.dimensions.height;
  let svg = '';
  if (horizontal) {
    const y = height - margin;
    svg += `<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="${theme.accent}" stroke-width="4"/>`;
    svg += `<path d="M${margin},${y} l18,-10 l0,20 z M${width - margin},${y} l-18,-10 l0,20 z" fill="${theme.accent}"/>`;
    svg += `<rect x="${width / 2 - 95}" y="${y - fontSize * 1.6}" width="190" height="${fontSize * 1.9}" rx="${fontSize * 0.7}" fill="${theme.panel}" fill-opacity="0.94"/>`;
    svg += `<text x="${width / 2}" y="${y - fontSize * 0.35}" fill="${theme.foreground}" font-family="Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif" font-size="${fontSize}" font-weight="850" text-anchor="middle">${escapeXml(horizontal)}</text>`;
  }
  if (vertical) {
    const x = width - margin;
    svg += `<line x1="${x}" y1="${margin}" x2="${x}" y2="${height - margin}" stroke="${theme.accent}" stroke-width="4"/>`;
    svg += `<path d="M${x},${margin} l-10,18 l20,0 z M${x},${height - margin} l-10,-18 l20,0 z" fill="${theme.accent}"/>`;
    svg += `<g transform="translate(${x - fontSize * 1.1},${height / 2}) rotate(-90)"><rect x="-95" y="-${fontSize * 1.35}" width="190" height="${fontSize * 1.9}" rx="${fontSize * 0.7}" fill="${theme.panel}" fill-opacity="0.94"/><text x="0" y="0" fill="${theme.foreground}" font-family="Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif" font-size="${fontSize}" font-weight="850" text-anchor="middle">${escapeXml(vertical)}</text></g>`;
  }
  if (content.dimensions.weight) {
    svg += `<rect x="${margin}" y="${margin}" width="${Math.max(180, fontSize * 8)}" height="${fontSize * 2.3}" rx="${fontSize}" fill="${theme.panel}" fill-opacity="0.94"/><text x="${margin + fontSize}" y="${margin + fontSize * 1.5}" fill="${theme.foreground}" font-family="Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif" font-size="${fontSize}" font-weight="800">${escapeXml(content.dimensions.weight)}</text>`;
  }
  return svg;
}

function chipsSvg(document, items, theme, yRatio = 0.78) {
  if (!items.length) return '';
  const width = document.targetWidth;
  const height = document.targetHeight;
  const fontSize = Math.max(15, Math.round(Math.min(width, height) * 0.022));
  const gap = Math.round(fontSize * 0.6);
  const paddingX = Math.round(fontSize * 0.9);
  const chips = items.slice(0, 8).map((item) => ({ text: item, width: Math.min(width * 0.32, Math.max(fontSize * 4, item.length * fontSize * 0.75 + paddingX * 2)) }));
  const total = chips.reduce((sum, item) => sum + item.width, 0) + gap * (chips.length - 1);
  let x = Math.max(width * 0.05, (width - total) / 2);
  const y = Math.round(height * yRatio);
  return chips.map((chip) => {
    const itemSvg = `<rect x="${x}" y="${y}" width="${chip.width}" height="${fontSize * 2.35}" rx="${fontSize * 1.1}" fill="${theme.panel}" fill-opacity="0.94" stroke="${theme.line}" stroke-width="2"/><text x="${x + chip.width / 2}" y="${y + fontSize * 1.5}" fill="${theme.foreground}" font-family="Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif" font-size="${fontSize}" font-weight="750" text-anchor="middle">${escapeXml(chip.text)}</text>`;
    x += chip.width + gap;
    return itemSvg;
  }).join('');
}

function comparisonSvg(document, content, theme) {
  const width = document.targetWidth;
  const height = document.targetHeight;
  const margin = Math.round(Math.min(width, height) * 0.055);
  const gap = Math.round(margin * 0.45);
  const panelWidth = (width - margin * 2 - gap) / 2;
  const panelHeight = Math.round(height * 0.31);
  const y = height - margin - panelHeight;
  const titleSize = Math.max(22, Math.round(Math.min(width, height) * 0.032));
  const itemSize = Math.max(14, Math.round(titleSize * 0.55));
  const columns = [
    { x: margin, title: content.comparison.leftTitle, items: content.comparison.leftItems, accent: theme.accent },
    { x: margin + panelWidth + gap, title: content.comparison.rightTitle, items: content.comparison.rightItems, accent: theme.muted }
  ];
  return columns.map((column) => {
    let svg = `<rect x="${column.x}" y="${y}" width="${panelWidth}" height="${panelHeight}" rx="${margin * 0.4}" fill="${theme.panel}" fill-opacity="0.94" stroke="${column.accent}" stroke-width="3"/>`;
    svg += `<text x="${column.x + margin * 0.55}" y="${y + margin * 0.65 + titleSize}" fill="${theme.foreground}" font-family="Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif" font-size="${titleSize}" font-weight="850">${escapeXml(column.title)}</text>`;
    column.items.slice(0, 4).forEach((item, index) => {
      const itemY = y + margin * 0.75 + titleSize * 2.1 + index * itemSize * 1.65;
      svg += `<circle cx="${column.x + margin * 0.65}" cy="${itemY - itemSize * 0.2}" r="${itemSize * 0.2}" fill="${column.accent}"/>`;
      svg += textBlock(wrapText(item, 26, 1), { x: column.x + margin * 0.95, y: itemY, fontSize: itemSize, lineHeight: itemSize * 1.4, color: theme.foreground, weight: 650 });
    });
    return svg;
  }).join('');
}

function sequenceSvg(document, items, theme) {
  const width = document.targetWidth;
  const height = document.targetHeight;
  const margin = Math.round(Math.min(width, height) * 0.055);
  const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.02));
  const cardWidth = Math.round((width - margin * 2 - margin * 0.5) / 2);
  const cardHeight = Math.round(fontSize * 3.4);
  const startY = height - margin - Math.ceil(items.slice(0, 6).length / 2) * (cardHeight + margin * 0.18);
  return items.slice(0, 6).map((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + column * (cardWidth + margin * 0.5);
    const y = startY + row * (cardHeight + margin * 0.18);
    return `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="${fontSize}" fill="${theme.panel}" fill-opacity="0.94" stroke="${theme.line}" stroke-width="2"/><circle cx="${x + fontSize * 1.7}" cy="${y + cardHeight / 2}" r="${fontSize * 0.95}" fill="${theme.accent}"/><text x="${x + fontSize * 1.7}" y="${y + cardHeight / 2 + fontSize * 0.34}" fill="${theme.foreground}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900" text-anchor="middle">${index + 1}</text>${textBlock(wrapText(item, 22, 1), { x: x + fontSize * 3.2, y: y + cardHeight / 2 + fontSize * 0.35, fontSize, lineHeight: fontSize * 1.4, color: theme.foreground, weight: 700 })}`;
  }).join('');
}

function buildOverlaySvg(document) {
  const content = normalizeDeliveryContent(document.content);
  const advanced = normalizeDeliveryAdvanced(document.advanced);
  const theme = getDeliveryTheme(document.themeId);
  let body = '';
  if (document.documentType === 'comparison') body += comparisonSvg(document, content, theme);
  else body += generalPanelSvg(document, content, advanced, theme);
  if (document.documentType === 'dimensions') body += dimensionsSvg(document, content, theme);
  if (document.documentType === 'package-contents') body += chipsSvg(document, content.packageItems, theme, 0.74);
  if (document.documentType === 'variants') body += chipsSvg(document, content.variants, theme, 0.78);
  if (document.documentType === 'storyboard' || document.documentType === 'how-to') body += sequenceSvg(document, content.steps, theme);
  return Buffer.from(`<svg width="${document.targetWidth}" height="${document.targetHeight}" viewBox="0 0 ${document.targetWidth} ${document.targetHeight}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
}

export async function analyzeDeliverySource(storagePath) {
  const stored = await readStoredImage(storagePath);
  const image = sharp(stored.bytes).rotate();
  const metadata = await image.metadata();
  const sampleSize = 24;
  const { data, info } = await image.resize(sampleSize, sampleSize, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const corner = 5;
  let total = 0;
  let white = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!(x < corner || x >= info.width - corner) || !(y < corner || y >= info.height - corner)) continue;
      total += 1;
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] >= 238 && data[offset + 1] >= 238 && data[offset + 2] >= 238) white += 1;
    }
  }
  return {
    stored,
    sourceWidth: Number(metadata.width || 0),
    sourceHeight: Number(metadata.height || 0),
    whiteCornerRatio: total ? white / total : 0
  };
}

export async function renderDeliveryDocument({ document, sourceStoragePath, logoStoragePath = '' }) {
  const advanced = normalizeDeliveryAdvanced(document.advanced);
  const source = await readStoredImage(sourceStoragePath);
  const background = document.themeId === 'glass-dark' || document.themeId === 'brand-gradient'
    ? { r: 9, g: 15, b: 28, alpha: 1 }
    : { r: 255, g: 255, b: 255, alpha: 1 };
  const base = await sharp(source.bytes)
    .rotate()
    .resize(document.targetWidth, document.targetHeight, {
      fit: advanced.imageFit,
      position: 'centre',
      background
    })
    .png()
    .toBuffer();
  const composites = [{ input: buildOverlaySvg(document), top: 0, left: 0 }];
  if (logoStoragePath) {
    const logo = await readStoredImage(logoStoragePath);
    const maxWidth = Math.round(document.targetWidth * 0.17);
    const maxHeight = Math.round(document.targetHeight * 0.1);
    const resized = await sharp(logo.bytes).rotate().resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    const margin = Math.round(Math.min(document.targetWidth, document.targetHeight) * 0.045);
    composites.push({ input: resized.data, top: margin, left: margin });
  }
  let rendered = sharp(base).composite(composites);
  if (document.outputFormat === 'jpeg') rendered = rendered.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
  else if (document.outputFormat === 'webp') rendered = rendered.webp({ quality: 92 });
  else rendered = rendered.png({ compressionLevel: 8 });
  return {
    bytes: await rendered.toBuffer(),
    contentType: document.outputFormat === 'jpeg' ? 'image/jpeg' : document.outputFormat === 'webp' ? 'image/webp' : 'image/png',
    extension: document.outputFormat === 'jpeg' ? 'jpg' : document.outputFormat
  };
}

export async function renderDetailPage(renderedItems, targetWidth = 1200) {
  const normalized = [];
  for (const item of renderedItems.slice(0, 24)) {
    const result = await sharp(item.bytes).resize({ width: targetWidth, withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true });
    normalized.push({ bytes: result.data, width: result.info.width, height: result.info.height });
  }
  if (!normalized.length) return null;
  const totalHeight = normalized.reduce((sum, item) => sum + item.height, 0);
  const canvas = sharp({ create: { width: targetWidth, height: totalHeight, channels: 4, background: '#ffffff' } });
  let top = 0;
  const composites = normalized.map((item) => {
    const composite = { input: item.bytes, top, left: Math.max(0, Math.round((targetWidth - item.width) / 2)) };
    top += item.height;
    return composite;
  });
  return canvas.composite(composites).png({ compressionLevel: 8 }).toBuffer();
}

