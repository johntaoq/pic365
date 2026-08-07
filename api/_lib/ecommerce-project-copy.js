import { randomUUID } from 'node:crypto';
import {
  createEcommerceProject,
  createEcommerceProjectAsset,
  deleteEcommerceProject,
  getEcommerceProject,
  listEcommerceProjectAssets,
  setEcommerceProjectMasterAsset
} from './local-db.js';
import { syncEcommerceProjectOutputs } from './ecommerce-p1-db.js';
import {
  createEcommerceDeliveryDocument,
  listEcommerceDeliveryDocuments
} from './ecommerce-delivery-db.js';
import { deleteStoredFile, persistProjectAsset, readStoredImage } from './storage.js';
import {
  getDefaultSlotIds,
  getEcommercePlatform,
  getEcommerceTemplates
} from '../../shared/ecommerce-catalog.js';
import { createDeliveryDocumentDraft } from '../../shared/ecommerce-delivery.js';

function projectValuesFromConfig(config, targetPlatformId, { projectName = '', useRecommendedTemplate = false } = {}) {
  const platform = getEcommercePlatform(targetPlatformId);
  const recommended = useRecommendedTemplate
    ? getEcommerceTemplates(targetPlatformId, config.industryId)?.[0]
    : null;
  const validSlotIds = new Set(platform.slots.map((slot) => slot.id));
  const preservedSlots = (config.selectedSlots || []).filter((slotId) => validSlotIds.has(slotId));
  return {
    projectName: projectName || config.projectName || `${config.productName} · ${platform.nameZh}`,
    platformId: targetPlatformId,
    industryId: config.industryId,
    productName: config.productName,
    brandName: config.brandName || '',
    targetAudience: config.targetAudience || '',
    sellingPoints: Array.isArray(config.sellingPoints) ? config.sellingPoints : [],
    specifications: config.specifications || '',
    prohibitedContent: config.prohibitedContent || '',
    aiBriefOriginals: config.aiBriefOriginals || {},
    identitySpec: config.identitySpec || {},
    templateId: recommended?.id || (targetPlatformId === config.platformId ? config.templateId || '' : ''),
    visualStyleId: recommended?.visualStyleId || config.visualStyleId || 'clean-commercial',
    selectedSlots: recommended?.selectedSlotIds?.filter((slotId) => validSlotIds.has(slotId))
      || (preservedSlots.length ? preservedSlots : getDefaultSlotIds(targetPlatformId))
  };
}

async function copyProjectAssets(userId, sourceProject, targetProject, copiedStoragePaths) {
  const assets = listEcommerceProjectAssets(userId, sourceProject.id);
  const assetIdMap = new Map();
  for (const asset of assets) {
    const stored = await readStoredImage(asset.storagePath);
    const assetId = randomUUID();
    const dataUrl = `data:${stored.contentType};base64,${stored.bytes.toString('base64')}`;
    const persisted = await persistProjectAsset({
      userId,
      projectId: targetProject.id,
      assetId,
      image: dataUrl
    });
    copiedStoragePaths.push(persisted.storagePath);
    createEcommerceProjectAsset(userId, {
      id: assetId,
      projectId: targetProject.id,
      assetType: asset.assetType,
      fileName: asset.fileName,
      mimeType: persisted.contentType,
      fileSize: persisted.byteLength,
      storagePath: persisted.storagePath,
      purpose: asset.purpose,
      sortOrder: asset.sortOrder
    });
    assetIdMap.set(asset.id, assetId);
  }
  const copiedMasterId = assetIdMap.get(sourceProject.masterAssetId);
  if (copiedMasterId) setEcommerceProjectMasterAsset(userId, targetProject.id, copiedMasterId);
  return assetIdMap;
}

function copyDeliveryConfiguration(userId, sourceProjectId, targetProjectId, assetIdMap) {
  const documents = listEcommerceDeliveryDocuments(userId, sourceProjectId);
  for (const [index, document] of documents.entries()) {
    createEcommerceDeliveryDocument(userId, {
      ...document,
      projectId: targetProjectId,
      sourceGenerationId: '',
      moduleOrder: index + 1,
      content: {
        ...document.content,
        logoAssetId: assetIdMap.get(document.content.logoAssetId) || ''
      },
      validation: {}
    });
  }
}

export async function duplicateEcommerceProject(userId, sourceProjectId, {
  targetPlatformId = '',
  projectName = '',
  copyAssets = true,
  copyDelivery = true
} = {}) {
  const sourceProject = getEcommerceProject(userId, sourceProjectId);
  if (!sourceProject) return null;
  const platformId = targetPlatformId || sourceProject.platformId;
  const adapted = platformId !== sourceProject.platformId;
  const values = projectValuesFromConfig(sourceProject, platformId, {
    projectName: projectName || `${sourceProject.projectName}${adapted ? ' · ' + getEcommercePlatform(platformId).nameZh : ' · 副本'}`,
    useRecommendedTemplate: adapted
  });
  const project = createEcommerceProject(userId, values);
  const copiedStoragePaths = [];
  try {
    syncEcommerceProjectOutputs(userId, project.id, project.selectedSlots);
    let assetIdMap = new Map();
    if (copyAssets) assetIdMap = await copyProjectAssets(userId, sourceProject, project, copiedStoragePaths);
    if (copyDelivery && !adapted) copyDeliveryConfiguration(userId, sourceProject.id, project.id, assetIdMap);
    return getEcommerceProject(userId, project.id);
  } catch (error) {
    deleteEcommerceProject(userId, project.id);
    await Promise.allSettled(copiedStoragePaths.map((storagePath) => deleteStoredFile(storagePath)));
    throw error;
  }
}

export function createEcommerceProjectFromTemplate(userId, template, { projectName = '', targetPlatformId = '' } = {}) {
  const config = template.projectConfig || {};
  const platformId = targetPlatformId || template.platformId || config.platformId;
  const adapted = platformId !== config.platformId;
  const values = projectValuesFromConfig(config, platformId, {
    projectName: projectName || `${template.name} · ${config.productName || '新项目'}`,
    useRecommendedTemplate: adapted
  });
  const project = createEcommerceProject(userId, values);
  syncEcommerceProjectOutputs(userId, project.id, project.selectedSlots);
  if (!adapted) {
    const platform = getEcommercePlatform(project.platformId);
    for (const [index, document] of (template.deliveryConfig || []).entries()) {
      if (!project.selectedSlots.includes(document.slotId)) continue;
      const slot = platform.slots.find((item) => item.id === document.slotId);
      if (!slot) continue;
      const draft = createDeliveryDocumentDraft({ project, slot, output: null, language: 'zh', order: index + 1 });
      createEcommerceDeliveryDocument(userId, {
        ...draft,
        ...document,
        projectId: project.id,
        sourceGenerationId: '',
        moduleOrder: index + 1,
        content: draft.content
      });
    }
  }
  return project;
}
