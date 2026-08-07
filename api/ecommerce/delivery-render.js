import JSZip from 'jszip';
import {
  getEcommerceProject,
  getEcommerceProjectAsset,
  getGeneration
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import {
  getEcommerceDeliveryDocument,
  listEcommerceDeliveryDocuments,
  updateEcommerceDeliveryValidation
} from '../_lib/ecommerce-delivery-db.js';
import {
  analyzeDeliverySource,
  renderDeliveryDocument,
  renderDetailPage
} from '../_lib/ecommerce-renderer.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';
import {
  buildDeliveryFilename,
  validateDeliveryDocument
} from '../../shared/ecommerce-delivery.js';
import { getEcommercePlatform } from '../../shared/ecommerce-catalog.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeArchiveName(value, fallback = 'ecommerce-delivery') {
  return String(value || fallback).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 100) || fallback;
}

async function resolveRenderInputs(userId, project, document, platform) {
  const slot = platform.slots.find((item) => item.id === document.slotId);
  const generation = document.sourceGenerationId ? getGeneration(userId, document.sourceGenerationId) : null;
  if (!slot || !generation || generation.project_id !== project.id || generation.slot_id !== slot.id || generation.status !== 'succeeded' || !generation.storage_path) {
    return { error: 'DELIVERY_SOURCE_UNAVAILABLE' };
  }
  let logoStoragePath = '';
  if (document.content?.logoAssetId) {
    const logo = getEcommerceProjectAsset(userId, document.content.logoAssetId);
    if (logo?.projectId === project.id && logo.assetType === 'logo') logoStoragePath = logo.storagePath;
  }
  const analyzed = await analyzeDeliverySource(generation.storage_path);
  const diagnostics = {
    sourceWidth: analyzed.sourceWidth,
    sourceHeight: analyzed.sourceHeight,
    whiteCornerRatio: analyzed.whiteCornerRatio
  };
  const validation = {
    ...validateDeliveryDocument({ document, project, slot, diagnostics }),
    checkedAt: new Date().toISOString(),
    diagnostics
  };
  return { slot, generation, logoStoragePath, validation };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    const previewRateLimit = checkRateLimit(req, { key: `delivery-preview:${auth.user.id}`, limit: 600, windowMs: 60 * 60 * 1000 });
    applyRateLimitHeaders(res, previewRateLimit);
    if (!previewRateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });
    const documentId = cleanText(req.query?.documentId, 80);
    const document = getEcommerceDeliveryDocument(auth.user.id, documentId);
    if (!document) return json(res, 404, { ok: false, error: 'DELIVERY_DOCUMENT_NOT_FOUND' });
    const project = getEcommerceProject(auth.user.id, document.projectId);
    if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
    try {
      const platform = getEcommercePlatform(project.platformId);
      const inputs = await resolveRenderInputs(auth.user.id, project, document, platform);
      if (inputs.error) return json(res, 400, { ok: false, error: inputs.error });
      const rendered = await renderDeliveryDocument({
        document,
        sourceStoragePath: inputs.generation.storage_path,
        logoStoragePath: inputs.logoStoragePath
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', rendered.contentType);
      res.setHeader('Cache-Control', 'private, no-store');
      if (String(req.query?.download || '') === '1') {
        const language = req.query?.language === 'en' ? 'en' : 'zh';
        const filename = buildDeliveryFilename({
          productName: project.productName,
          slotName: language === 'zh' ? inputs.slot.nameZh : inputs.slot.nameEn,
          platformId: project.platformId,
          versionNumber: inputs.generation.version_number,
          language,
          format: document.outputFormat
        });
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      }
      res.end(rendered.bytes);
      return;
    } catch (error) {
      console.warn('Delivery preview rendering failed', { message: String(error?.message || 'unknown').slice(0, 240) });
      return json(res, 500, { ok: false, error: 'DELIVERY_RENDER_FAILED' });
    }
  }

  const rateLimit = checkRateLimit(req, { key: `delivery-export:${auth.user.id}`, limit: 30, windowMs: 60 * 60 * 1000 });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_DELIVERY_EXPORT' });
  }
  const projectId = cleanText(body.projectId, 80);
  const project = getEcommerceProject(auth.user.id, projectId);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  const platform = getEcommercePlatform(project.platformId);
  const requestedIds = new Set((Array.isArray(body.documentIds) ? body.documentIds : []).map(String));
  const allDocuments = listEcommerceDeliveryDocuments(auth.user.id, project.id)
    .filter((document) => project.selectedSlots.includes(document.slotId));
  const documents = allDocuments.filter((document) => requestedIds.size ? requestedIds.has(document.id) : document.includeInExport);
  if (!documents.length || documents.length > 30) return json(res, 400, { ok: false, error: 'NO_DELIVERY_DOCUMENTS' });
  if (!requestedIds.size) {
    const includedSlots = new Set(documents.map((document) => document.slotId));
    const excludedRequiredSlots = platform.slots
      .filter((slot) => slot.required && project.selectedSlots.includes(slot.id) && !includedSlots.has(slot.id))
      .map((slot) => slot.id);
    if (excludedRequiredSlots.length) {
      return json(res, 409, {
        ok: false,
        error: 'DELIVERY_NOT_READY',
        blocked: excludedRequiredSlots.map((slotId) => ({ slotId, error: 'REQUIRED_SLOT_EXCLUDED' }))
      });
    }
  }

  const language = body.language === 'en' ? 'en' : 'zh';
  const prepared = [];
  const blocked = [];
  try {
    for (const document of documents) {
      const inputs = await resolveRenderInputs(auth.user.id, project, document, platform);
      if (inputs.error) {
        blocked.push({ documentId: document.id, slotId: document.slotId, error: inputs.error });
        continue;
      }
      updateEcommerceDeliveryValidation(auth.user.id, document.id, inputs.validation);
      if (!inputs.validation.ready) {
        blocked.push({ documentId: document.id, slotId: document.slotId, validation: inputs.validation });
        continue;
      }
      const rendered = await renderDeliveryDocument({
        document,
        sourceStoragePath: inputs.generation.storage_path,
        logoStoragePath: inputs.logoStoragePath
      });
      prepared.push({ document, ...inputs, rendered });
    }
    if (blocked.length) return json(res, 409, { ok: false, error: 'DELIVERY_NOT_READY', blocked });

    const zip = new JSZip();
    const manifest = [];
    for (const item of prepared) {
      const slotName = language === 'zh' ? item.slot.nameZh : item.slot.nameEn;
      const filename = buildDeliveryFilename({
        productName: project.productName,
        slotName,
        platformId: project.platformId,
        versionNumber: item.generation.version_number,
        language,
        format: item.document.outputFormat
      });
      zip.file(filename, item.rendered.bytes);
      manifest.push({
        filename,
        slotId: item.slot.id,
        slotName,
        documentType: item.document.documentType,
        sourceGenerationId: item.generation.id,
        sourceVersion: Number(item.generation.version_number || 1),
        width: item.document.targetWidth,
        height: item.document.targetHeight,
        format: item.document.outputFormat,
        validationScore: item.validation.score,
        warnings: item.validation.rules.filter((rule) => rule.status === 'warning').map((rule) => language === 'zh' ? rule.titleZh : rule.titleEn)
      });
    }
    if (body.includeDetailPage) {
      const longImage = await renderDetailPage(prepared.map((item) => item.rendered));
      if (longImage) zip.file(`${safeArchiveName(project.productName)}-${language === 'zh' ? '详情长图' : 'detail-page'}-${language === 'zh' ? platform.nameZh : platform.nameEn}.png`, longImage);
    }
    const report = {
      projectId: project.id,
      projectName: project.projectName,
      productName: project.productName,
      platformId: project.platformId,
      exportedAt: new Date().toISOString(),
      files: manifest
    };
    zip.file(language === 'zh' ? '交付清单.json' : 'delivery-manifest.json', JSON.stringify(report, null, 2));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const archiveName = `${safeArchiveName(project.productName)}-${safeArchiveName(language === 'zh' ? platform.nameZh : platform.nameEn)}-${language === 'zh' ? '交付包' : 'delivery'}.zip`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buffer);
  } catch (error) {
    console.warn('Delivery export failed', { message: String(error?.message || 'unknown').slice(0, 240) });
    return json(res, 500, { ok: false, error: 'DELIVERY_EXPORT_FAILED' });
  }
}
