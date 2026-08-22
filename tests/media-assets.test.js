import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-media-assets-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.ASSET_QUOTA_BYTES = String(512 * 1024 * 1024);
process.env.ASSET_PROCESSING_INLINE = '1';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const [db, media, references] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/media-assets.js'),
  import('../api/_lib/reference-images.js')
]);

const owner = db.createUser({ email: 'asset-owner@example.com', password: 'testing-1234', fullName: 'Asset Owner' });
const member = db.createUser({ email: 'asset-member@example.com', password: 'testing-1234', fullName: 'Asset Member' });

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('unified asset library uploads image variants and supports organization lifecycle', async () => {
  const bytes = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#38bdf8' } }).png().toBuffer();
  const collection = media.createCollection(owner.id, { name: 'Launch brand', type: 'brand', color: '#38bdf8' });
  const asset = await media.createUploadedAsset(owner.id, {
    bytes,
    mimeType: 'image/png',
    fileName: 'hero.png',
    collectionId: collection.id,
    tags: ['launch', 'hero']
  });
  assert.equal(asset.mediaType, 'image');
  assert.equal(asset.width, 900);
  assert.equal(asset.height, 600);
  assert.equal(asset.collectionType, 'brand');
  assert.deepEqual(asset.tags, ['hero', 'launch']);
  assert.ok(asset.variants.some((variant) => variant.type === 'thumbnail'));
  assert.ok(asset.variants.some((variant) => variant.type === 'preview'));

  const updated = media.updateAsset(owner.id, asset.id, { name: 'Launch hero', favorite: true, tags: ['campaign'] });
  assert.equal(updated.name, 'Launch hero');
  assert.equal(updated.favorite, true);
  assert.deepEqual(updated.tags, ['campaign']);
  assert.equal(media.listAssets(owner.id, { favorite: true }).assets.length, 1);
  assert.equal(media.listAssets(owner.id, { collectionId: collection.id }).assets.some((item) => item.id === asset.id), true);
  assert.equal(media.listAssets(owner.id, { query: 'launch hero' }).assets.some((item) => item.id === asset.id), true);
  assert.equal(media.listAssets(owner.id, { query: 'launch brand' }).assets.some((item) => item.id === asset.id), true);
  assert.equal(media.listAssets(owner.id, { query: 'campaign' }).assets.some((item) => item.id === asset.id), false);

  const deleted = media.updateAsset(owner.id, asset.id, { deleted: true });
  assert.ok(deleted.deletedAt);
  assert.equal(media.listAssets(owner.id).assets.length, 0);
  assert.equal(media.listAssets(owner.id, { deleted: true }).assets.length, 1);
  assert.equal(media.updateAsset(owner.id, asset.id, { deleted: false }).deletedAt, '');
});

test('one asset can belong to multiple folders and brand kits without replacement', async () => {
  const bytes = await sharp({ create: { width: 720, height: 480, channels: 3, background: '#22c55e' } }).png().toBuffer();
  const campaignFolder = media.createCollection(owner.id, { name: 'Campaign 2026', type: 'folder' });
  const productFolder = media.createCollection(owner.id, { name: 'Product originals', type: 'folder' });
  const primaryBrand = media.createCollection(owner.id, { name: 'Primary brand', type: 'brand' });
  const seasonalBrand = media.createCollection(owner.id, { name: 'Seasonal brand', type: 'brand' });
  const asset = await media.createUploadedAsset(owner.id, {
    bytes,
    mimeType: 'image/png',
    fileName: 'multi-collection.png'
  });

  const organized = media.updateAsset(owner.id, asset.id, {
    collectionIds: [campaignFolder.id, productFolder.id, primaryBrand.id]
  });
  assert.deepEqual(new Set(organized.collectionIds), new Set([campaignFolder.id, productFolder.id, primaryBrand.id]));
  for (const collectionId of organized.collectionIds) {
    assert.equal(media.listAssets(owner.id, { collectionId }).assets.some((item) => item.id === asset.id), true);
  }

  const [afterBatchBrand] = media.assignAssetsToCollection(owner.id, [asset.id], seasonalBrand.id);
  assert.deepEqual(
    new Set(afterBatchBrand.collectionIds),
    new Set([campaignFolder.id, productFolder.id, primaryBrand.id, seasonalBrand.id])
  );
  assert.equal(media.listCollections(owner.id).find((item) => item.id === seasonalBrand.id).assetCount, 1);

  assert.equal(media.deleteCollection(owner.id, campaignFolder.id), true);
  const afterFolderDelete = media.getAccessibleAsset(owner.id, asset.id);
  assert.equal(afterFolderDelete.collectionIds.includes(campaignFolder.id), false);
  assert.deepEqual(
    new Set(afterFolderDelete.collectionIds),
    new Set([productFolder.id, primaryBrand.id, seasonalBrand.id])
  );
});

test('projects reference the same asset file without copying it', async () => {
  const asset = media.listAssets(owner.id, { mediaType: 'image' }).assets[0];
  const project = db.createEcommerceProject(owner.id, {
    projectName: 'Asset-link project', platformId: 'taobao', industryId: 'digital', productName: 'Camera', brandName: '',
    coreUser: '', coreScenario: '', sellingPoints: [], specifications: '', prohibitedContent: '', aiBriefOriginals: {}, identitySpec: {},
    templateId: '', visualStyleId: 'clean-commercial', imageProviderId: '', selectedSlots: []
  });
  media.linkAssetToProject(owner.id, asset.id, project.id, { assetType: 'product', role: 'master' });
  const row = db.getDb().prepare(`
    SELECT projectAsset.media_asset_id, projectAsset.storage_path, asset.original_storage_path
    FROM ecommerce_project_assets projectAsset JOIN assets asset ON asset.id = projectAsset.media_asset_id
    WHERE projectAsset.project_id = ?
  `).get(project.id);
  assert.equal(row.media_asset_id, asset.id);
  assert.equal(row.storage_path, row.original_storage_path);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) count FROM asset_project_links WHERE asset_id = ? AND project_id = ?').get(asset.id, project.id).count >= 1, true);
});

test('ecommerce projects accept at most nine images and reject assets over 5 MB', async () => {
  const bytes = await sharp({ create: { width: 48, height: 48, channels: 3, background: '#0ea5e9' } }).png().toBuffer();
  const project = db.createEcommerceProject(owner.id, {
    projectName: 'Nine-image project', platformId: 'taobao', industryId: 'digital', productName: 'Camera', brandName: '',
    coreUser: '', coreScenario: '', sellingPoints: [], specifications: '', prohibitedContent: '', aiBriefOriginals: {}, identitySpec: {},
    templateId: '', visualStyleId: 'clean-commercial', imageProviderId: '', selectedSlots: []
  });
  const assets = [];
  for (let index = 0; index < 10; index += 1) {
    assets.push(await media.createUploadedAsset(owner.id, {
      bytes,
      mimeType: 'image/png',
      fileName: `project-limit-${index}.png`
    }));
  }
  for (const asset of assets.slice(0, 9)) {
    media.linkAssetToProject(owner.id, asset.id, project.id, { assetType: 'product', role: 'product' });
  }
  assert.equal(db.listEcommerceProjectAssets(owner.id, project.id, { includeUnavailable: true }).length, 9);
  assert.throws(
    () => media.linkAssetToProject(owner.id, assets[9].id, project.id, { assetType: 'product', role: 'product' }),
    (error) => error?.code === 'ASSET_LIMIT_REACHED'
  );

  const oversizedProject = db.createEcommerceProject(owner.id, {
    projectName: 'Oversized-image project', platformId: 'taobao', industryId: 'digital', productName: 'Camera', brandName: '',
    coreUser: '', coreScenario: '', sellingPoints: [], specifications: '', prohibitedContent: '', aiBriefOriginals: {}, identitySpec: {},
    templateId: '', visualStyleId: 'clean-commercial', imageProviderId: '', selectedSlots: []
  });
  db.getDb().prepare('UPDATE assets SET file_size = ? WHERE id = ?').run(5 * 1024 * 1024 + 1, assets[9].id);
  assert.throws(
    () => media.linkAssetToProject(owner.id, assets[9].id, oversizedProject.id, { assetType: 'product', role: 'product' }),
    (error) => error?.code === 'ASSET_TOO_LARGE'
  );
});

test('deleting folders and brand kits preserves assets and returns them to unsorted', async () => {
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#14b8a6' } }).png().toBuffer();
  for (const type of ['folder', 'brand']) {
    const collection = media.createCollection(owner.id, { name: `Delete ${type}`, type });
    const asset = await media.createUploadedAsset(owner.id, {
      bytes,
      mimeType: 'image/png',
      fileName: `delete-${type}.png`,
      collectionId: collection.id
    });
    assert.equal(media.getAccessibleAsset(owner.id, asset.id).collectionId, collection.id);
    assert.equal(media.deleteCollection(owner.id, collection.id), true);
    assert.equal(media.listCollections(owner.id).some((item) => item.id === collection.id), false);
    const preserved = media.getAccessibleAsset(owner.id, asset.id);
    assert.ok(preserved);
    assert.equal(preserved.collectionId, '');
    assert.equal(preserved.collectionName, '');
  }
});

test('project asset roles update in place and unlinking preserves the library asset', () => {
  const asset = media.listAssets(owner.id, { mediaType: 'image' }).assets[0];
  const project = db.createEcommerceProject(owner.id, {
    projectName: 'Role project', platformId: 'taobao', industryId: 'digital', productName: 'Camera', brandName: '',
    coreUser: '', coreScenario: '', sellingPoints: [], specifications: '', prohibitedContent: '', aiBriefOriginals: {}, identitySpec: {},
    templateId: '', visualStyleId: 'clean-commercial', imageProviderId: '', selectedSlots: []
  });

  const productLink = media.linkAssetToProject(owner.id, asset.id, project.id, { assetType: 'product', role: 'product' });
  let projectAssets = db.listEcommerceProjectAssets(owner.id, project.id, { includeUnavailable: true });
  assert.equal(projectAssets.length, 1);
  assert.equal(projectAssets[0].assetType, 'product');
  assert.equal(db.getEcommerceProject(owner.id, project.id).masterAssetId, productLink.projectAssetId);

  media.linkAssetToProject(owner.id, asset.id, project.id, { assetType: 'logo', role: 'logo' });
  projectAssets = db.listEcommerceProjectAssets(owner.id, project.id, { includeUnavailable: true });
  assert.equal(projectAssets.length, 1);
  assert.equal(projectAssets[0].assetType, 'logo');
  assert.equal(db.getEcommerceProject(owner.id, project.id).masterAssetId, '');
  const roles = db.getDb().prepare('SELECT role FROM asset_project_links WHERE asset_id = ? AND project_id = ?').all(asset.id, project.id);
  assert.equal(roles.length, 1);
  assert.equal(roles[0].role, 'logo');
  const links = media.listAssetProjectLinks(owner.id, asset.id);
  assert.equal(links.some((link) => link.projectId === project.id && link.assetType === 'logo'), true);

  db.deleteEcommerceProjectAsset(owner.id, projectAssets[0].id);
  assert.equal(db.listEcommerceProjectAssets(owner.id, project.id, { includeUnavailable: true }).length, 0);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) count FROM asset_project_links WHERE asset_id = ? AND project_id = ?').get(asset.id, project.id).count, 0);
  assert.ok(media.getAccessibleAsset(owner.id, asset.id, { includeDeleted: false }));
});

test('team sharing exposes the same asset to registered members', () => {
  const asset = media.listAssets(owner.id, { mediaType: 'image' }).assets[0];
  const team = media.createTeam(owner.id, 'Creative crew');
  media.addTeamMember(owner.id, team.id, member.email, 'editor');
  media.shareAsset(owner.id, asset.id, { principalType: 'team', principalId: team.id, permission: 'edit' });
  const shared = media.listAssets(member.id, { shared: true }).assets;
  assert.equal(shared.length, 1);
  assert.equal(shared[0].id, asset.id);
  assert.equal(shared[0].shared, true);
  assert.deepEqual(media.listAssets(member.id, { teamId: team.id }).assets.map((item) => item.id), [asset.id]);
  assert.deepEqual(media.listAssets(owner.id, { teamId: team.id }).assets.map((item) => item.id), [asset.id]);
});

test('shared assets can be favorited and organized per user without changing the owner library', async () => {
  const bytes = await sharp({ create: { width: 640, height: 640, channels: 3, background: '#fb7185' } }).png().toBuffer();
  const asset = await media.createUploadedAsset(owner.id, {
    bytes,
    mimeType: 'image/png',
    fileName: 'personal-organization.png'
  });
  const ownerFavorite = asset.favorite;
  const ownerCollectionId = asset.collectionId;
  const team = media.createTeam(owner.id, 'Personal organization team');
  media.addTeamMember(owner.id, team.id, member.email, 'member');
  media.shareAsset(owner.id, asset.id, { principalType: 'team', principalId: team.id, permission: 'view' });
  const memberCollection = media.createCollection(member.id, { name: 'Member references', type: 'brand' });

  const organized = media.updateAsset(member.id, asset.id, {
    favorite: true,
    collectionId: memberCollection.id
  });
  assert.equal(organized.favorite, true);
  assert.equal(organized.collectionId, memberCollection.id);
  assert.equal(media.listAssets(member.id, { favorite: true }).assets.some((item) => item.id === asset.id), true);
  assert.equal(media.listAssets(member.id, { collectionId: memberCollection.id }).assets.some((item) => item.id === asset.id), true);
  assert.equal(media.listAssets(member.id, { query: 'member references' }).assets.some((item) => item.id === asset.id), true);
  assert.equal(media.listCollections(member.id).find((item) => item.id === memberCollection.id).assetCount, 1);

  const ownerView = media.getAccessibleAsset(owner.id, asset.id);
  assert.equal(ownerView.favorite, ownerFavorite);
  assert.equal(ownerView.collectionId, ownerCollectionId);
  assert.equal(media.listAssets(owner.id, { query: 'member references' }).assets.some((item) => item.id === asset.id), false);

  const project = db.createEcommerceProject(member.id, {
    projectName: 'Shared library project', platformId: 'taobao', industryId: 'digital', productName: 'Shared camera', brandName: '',
    coreUser: '', coreScenario: '', sellingPoints: [], specifications: '', prohibitedContent: '', aiBriefOriginals: {}, identitySpec: {},
    templateId: '', visualStyleId: 'clean-commercial', imageProviderId: '', selectedSlots: []
  });
  const linked = media.linkAssetToProject(member.id, asset.id, project.id, { assetType: 'reference', role: 'reference' });
  assert.equal(linked.asset.id, asset.id);
});

test('multiple accessible assets can be assigned to any personal category atomically', async () => {
  const bytes = await sharp({ create: { width: 480, height: 360, channels: 3, background: '#a855f7' } }).png().toBuffer();
  const sharedAsset = await media.createUploadedAsset(owner.id, { bytes, mimeType: 'image/png', fileName: 'bulk-shared.png' });
  const personalAsset = await media.createUploadedAsset(member.id, { bytes, mimeType: 'image/png', fileName: 'bulk-personal.png' });
  const team = media.createTeam(owner.id, 'Bulk brand team');
  media.addTeamMember(owner.id, team.id, member.email, 'member');
  media.shareAsset(owner.id, sharedAsset.id, { principalType: 'team', principalId: team.id, permission: 'view' });
  const brand = media.createCollection(member.id, { name: 'Bulk brand', type: 'brand' });
  const folder = media.createCollection(member.id, { name: 'Campaign category', type: 'folder' });

  const assignedToFolder = media.assignAssetsToCollection(member.id, [sharedAsset.id, personalAsset.id], folder.id);
  assert.deepEqual(assignedToFolder.map((asset) => asset.id).sort(), [sharedAsset.id, personalAsset.id].sort());
  assert.deepEqual(media.listAssets(member.id, { collectionId: folder.id }).assets.map((asset) => asset.id).sort(), [sharedAsset.id, personalAsset.id].sort());

  const updated = media.assignAssetsToCollection(member.id, [sharedAsset.id, personalAsset.id], brand.id);
  assert.deepEqual(updated.map((asset) => asset.id).sort(), [sharedAsset.id, personalAsset.id].sort());
  assert.deepEqual(media.listAssets(member.id, { collectionId: brand.id }).assets.map((asset) => asset.id).sort(), [sharedAsset.id, personalAsset.id].sort());
  assert.deepEqual(new Set(updated[0].collectionIds), new Set([folder.id, brand.id]));
  assert.equal(media.getAccessibleAsset(owner.id, sharedAsset.id).collectionId, '');
});

test('bulk deletion moves owned assets to trash and rejects mixed shared selections atomically', async () => {
  const bytes = await sharp({ create: { width: 360, height: 360, channels: 3, background: '#e11d48' } }).png().toBuffer();
  const firstOwned = await media.createUploadedAsset(member.id, { bytes, mimeType: 'image/png', fileName: 'bulk-delete-one.png' });
  const secondOwned = await media.createUploadedAsset(member.id, { bytes, mimeType: 'image/png', fileName: 'bulk-delete-two.png' });
  const deleted = media.moveAssetsToTrash(member.id, [firstOwned.id, secondOwned.id]);
  assert.equal(deleted.deleted, 2);
  assert.ok(media.getAccessibleAsset(member.id, firstOwned.id, { includeDeleted: true }).deletedAt);
  assert.ok(media.getAccessibleAsset(member.id, secondOwned.id, { includeDeleted: true }).deletedAt);

  const personalAsset = await media.createUploadedAsset(member.id, { bytes, mimeType: 'image/png', fileName: 'bulk-delete-personal.png' });
  const sharedAsset = await media.createUploadedAsset(owner.id, { bytes, mimeType: 'image/png', fileName: 'bulk-delete-shared.png' });
  const team = media.createTeam(owner.id, 'Bulk delete team');
  media.addTeamMember(owner.id, team.id, member.email, 'member');
  media.shareAsset(owner.id, sharedAsset.id, { principalType: 'team', principalId: team.id, permission: 'view' });
  assert.throws(
    () => media.moveAssetsToTrash(member.id, [personalAsset.id, sharedAsset.id]),
    (error) => error?.code === 'ASSET_NOT_OWNED'
  );
  assert.equal(media.getAccessibleAsset(member.id, personalAsset.id, { includeDeleted: true }).deletedAt, '');
  assert.equal(media.getAccessibleAsset(owner.id, sharedAsset.id, { includeDeleted: true }).deletedAt, '');
});

test('team-wide sharing automatically covers members added after the asset is shared', () => {
  const asset = media.listAssets(owner.id, { mediaType: 'image' }).assets[0];
  const lateMember = db.createUser({ email: 'late-team-member@example.com', password: 'testing-1234', fullName: 'Late Member' });
  const team = media.createTeam(owner.id, 'Growing team');
  media.shareAsset(owner.id, asset.id, { principalType: 'team', principalId: team.id, permission: 'view' });
  assert.equal(media.getAccessibleAsset(lateMember.id, asset.id, { includeDeleted: false }), null);

  media.addTeamMember(owner.id, team.id, lateMember.email, 'member');
  assert.equal(media.getAccessibleAsset(lateMember.id, asset.id, { includeDeleted: false })?.id, asset.id);
  assert.equal(media.listAssets(lateMember.id, { teamId: team.id }).assets.some((item) => item.id === asset.id), true);
});

test('team members and direct asset shares require registered users', () => {
  const asset = media.listAssets(owner.id, { mediaType: 'image' }).assets[0];
  const team = media.createTeam(owner.id, 'Verified members');

  assert.throws(
    () => media.addTeamMember(owner.id, team.id, 'missing-user@example.com', 'member'),
    (error) => error?.code === 'USER_NOT_FOUND'
  );
  assert.throws(
    () => media.addTeamMember(owner.id, team.id, owner.email, 'member'),
    (error) => error?.code === 'TEAM_OWNER_REQUIRED'
  );
  assert.equal(media.listTeams(owner.id).find((item) => item.id === team.id).members[0].role, 'owner');

  const added = media.addTeamMember(owner.id, team.id, member.email, 'editor');
  assert.equal(added.userId, member.id);
  assert.equal(added.email, member.email);

  assert.throws(
    () => media.shareAsset(owner.id, asset.id, { principalType: 'user', principalId: 'missing-user-id' }),
    (error) => error?.code === 'USER_NOT_FOUND'
  );
  assert.throws(
    () => media.shareAsset(owner.id, asset.id, { principalType: 'user', principalId: owner.id }),
    (error) => error?.code === 'CANNOT_SHARE_WITH_SELF'
  );

  const shared = media.shareAsset(owner.id, asset.id, {
    principalType: 'user',
    principalId: member.id,
    permission: 'edit'
  });
  assert.equal(shared.target.userId, member.id);
  assert.equal(shared.target.email, member.email);
  assert.equal(media.listAssetPermissions(owner.id, asset.id).some((item) => (
    item.principalType === 'user' && item.principalId === member.id && item.permission === 'edit'
  )), true);

  assert.equal(media.revokeAssetPermission(owner.id, asset.id, 'user', member.id), true);
  assert.equal(media.removeTeamMember(owner.id, team.id, member.id), true);
  assert.equal(media.listTeams(owner.id).find((item) => item.id === team.id).members.some((item) => item.userId === member.id), false);
});

test('selecting a team only returns assets shared to that exact team', async () => {
  const bytes = await sharp({ create: { width: 180, height: 180, channels: 3, background: '#f97316' } }).png().toBuffer();
  const firstAsset = await media.createUploadedAsset(owner.id, { bytes, mimeType: 'image/png', fileName: 'team-one.png' });
  const secondAsset = await media.createUploadedAsset(owner.id, { bytes, mimeType: 'image/png', fileName: 'team-two.png' });
  const firstTeam = media.createTeam(owner.id, 'Team one');
  const secondTeam = media.createTeam(owner.id, 'Team two');
  media.addTeamMember(owner.id, firstTeam.id, member.email, 'member');
  media.addTeamMember(owner.id, secondTeam.id, member.email, 'member');
  media.shareAsset(owner.id, firstAsset.id, { principalType: 'team', principalId: firstTeam.id, permission: 'view' });
  media.shareAsset(owner.id, secondAsset.id, { principalType: 'team', principalId: secondTeam.id, permission: 'view' });

  assert.deepEqual(media.listAssets(member.id, { teamId: firstTeam.id }).assets.map((item) => item.id), [firstAsset.id]);
  assert.deepEqual(media.listAssets(member.id, { teamId: secondTeam.id }).assets.map((item) => item.id), [secondAsset.id]);
  assert.deepEqual(media.listAssets(member.id, { teamId: 'not-a-team' }).assets, []);
});

test('shared editors can update descriptive fields but cannot change ownership controls', async () => {
  const bytes = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#0f766e' } }).png().toBuffer();
  const asset = await media.createUploadedAsset(owner.id, {
    bytes,
    mimeType: 'image/png',
    fileName: 'shared-edit.png'
  });
  const team = media.createTeam(owner.id, 'Shared editors');
  media.addTeamMember(owner.id, team.id, member.email, 'editor');
  media.shareAsset(owner.id, asset.id, { principalType: 'team', principalId: team.id, permission: 'edit' });

  const updated = media.updateAsset(member.id, asset.id, {
    name: 'Edited by teammate',
    tags: ['approved'],
    favorite: true,
    visibility: 'public',
    deleted: true
  });
  assert.equal(updated.name, 'Edited by teammate');
  assert.deepEqual(updated.tags, ['approved']);
  const ownerView = media.getAccessibleAsset(owner.id, asset.id, { includeDeleted: true });
  assert.equal(ownerView.favorite, false);
  assert.equal(ownerView.visibility, 'team');
  assert.equal(ownerView.deletedAt, '');

  assert.equal(media.removeTeamMember(owner.id, team.id, member.id), true);
  assert.equal(media.getAccessibleAsset(member.id, asset.id, { includeDeleted: false }), null);
});

test('deleting a team revokes its asset permissions without deleting owned files', async () => {
  const bytes = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#1d4ed8' } }).png().toBuffer();
  const asset = await media.createUploadedAsset(owner.id, { bytes, mimeType: 'image/png', fileName: 'team-delete.png' });
  const team = media.createTeam(owner.id, 'Temporary team');
  media.addTeamMember(owner.id, team.id, member.email, 'editor');
  media.shareAsset(owner.id, asset.id, { principalType: 'team', principalId: team.id, permission: 'view' });
  assert.ok(media.getAccessibleAsset(member.id, asset.id, { includeDeleted: false }));
  assert.equal(media.deleteTeam(owner.id, team.id), true);
  assert.equal(media.getAccessibleAsset(member.id, asset.id, { includeDeleted: false }), null);
  assert.ok(media.getAccessibleAsset(owner.id, asset.id, { includeDeleted: false }));
  assert.equal(media.listAssetPermissions(owner.id, asset.id).length, 0);
});

test('permanent deletion frees standalone files but blocks project-linked assets', async () => {
  const bytes = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#be123c' } }).png().toBuffer();
  const standalone = await media.createUploadedAsset(owner.id, { bytes, mimeType: 'image/png', fileName: 'trash-me.png' });
  const standalonePaths = standalone.variants.map((variant) => path.join(process.env.LOCAL_STORAGE_ROOT, variant.storagePath));
  media.updateAsset(owner.id, standalone.id, { deleted: true });
  assert.equal(await media.permanentlyDeleteAsset(owner.id, standalone.id), true);
  assert.equal(media.getAccessibleAsset(owner.id, standalone.id, { includeDeleted: true }), null);
  for (const filePath of standalonePaths) assert.equal(fs.existsSync(filePath), false);

  const linked = await media.createUploadedAsset(owner.id, { bytes, mimeType: 'image/png', fileName: 'linked.png' });
  const project = db.createEcommerceProject(owner.id, {
    projectName: 'Deletion guard project', platformId: 'taobao', industryId: 'digital', productName: 'Camera', brandName: '',
    coreUser: '', coreScenario: '', sellingPoints: [], specifications: '', prohibitedContent: '', aiBriefOriginals: {}, identitySpec: {},
    templateId: '', visualStyleId: 'clean-commercial', imageProviderId: '', selectedSlots: []
  });
  const link = media.linkAssetToProject(owner.id, linked.id, project.id, { assetType: 'product', role: 'master' });
  media.updateAsset(owner.id, linked.id, { deleted: true });
  await assert.rejects(() => media.permanentlyDeleteAsset(owner.id, linked.id), (error) => error?.code === 'ASSET_IN_USE');
  db.deleteEcommerceProjectAsset(owner.id, link.projectAssetId);
  assert.equal(await media.permanentlyDeleteAsset(owner.id, linked.id), true);
});

test('removing a generated asset from the library preserves generation history and its source blob', async () => {
  const generationId = 'source-backed-delete-test';
  const storagePath = `${owner.id}/${generationId}.png`;
  const filePath = path.join(process.env.LOCAL_STORAGE_ROOT, storagePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 128, height: 128, channels: 3, background: '#7c3aed' } }).png().toFile(filePath);
  db.getDb().prepare(`
    INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at, completed_at)
    VALUES (?, ?, 'source-backed prompt', 'gpt-image-2', '1024x1024', 'low', 'test', 'succeeded', ?, datetime('now'), datetime('now'))
  `).run(generationId, owner.id, storagePath);
  db.updateGeneration(generationId, { completed_at: new Date().toISOString() });
  const asset = media.listAssets(owner.id, { sourceType: 'generated' }).assets.find((item) => item.sourceId === generationId);
  assert.ok(asset);
  media.updateAsset(owner.id, asset.id, { deleted: true });
  assert.equal(await media.permanentlyDeleteAsset(owner.id, asset.id), true);
  assert.equal(fs.existsSync(filePath), true);
  assert.equal(db.getGeneration(owner.id, generationId).status, 'succeeded');
});

test('revoked team access immediately blocks project use while allowing unlink cleanup', () => {
  const asset = media.listAssets(owner.id, { mediaType: 'image' }).assets[0];
  const sharedTeamId = db.getDb().prepare(`
    SELECT principal_id AS team_id FROM asset_permissions
    WHERE asset_id = ? AND principal_type = 'team'
    ORDER BY created_at ASC LIMIT 1
  `).get(asset.id)?.team_id;
  const team = media.listTeams(member.id).find((item) => item.id === sharedTeamId);
  assert.ok(team);
  const project = db.createEcommerceProject(member.id, {
    projectName: 'Shared asset project', platformId: 'taobao', industryId: 'digital', productName: 'Shared camera', brandName: '',
    coreUser: '', coreScenario: '', sellingPoints: [], specifications: '', prohibitedContent: '', aiBriefOriginals: {}, identitySpec: {},
    templateId: '', visualStyleId: 'clean-commercial', imageProviderId: '', selectedSlots: []
  });
  media.linkAssetToProject(member.id, asset.id, project.id, { assetType: 'reference', role: 'reference' });
  assert.equal(db.listEcommerceProjectAssets(member.id, project.id).length, 1);

  db.getDb().prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(team.id, member.id);
  assert.equal(db.listEcommerceProjectAssets(member.id, project.id).length, 0);
  const unavailable = db.listEcommerceProjectAssets(member.id, project.id, { includeUnavailable: true });
  assert.equal(unavailable.length, 1);
  assert.equal(unavailable[0].available, false);
  assert.equal(db.getEcommerceProjectAsset(member.id, unavailable[0].id), null);
  assert.equal(db.getEcommerceProjectAsset(member.id, unavailable[0].id, { includeUnavailable: true }).unavailableReason, 'ASSET_ACCESS_REVOKED');

  db.deleteEcommerceProjectAsset(member.id, unavailable[0].id);
  assert.equal(db.listEcommerceProjectAssets(member.id, project.id, { includeUnavailable: true }).length, 0);
  assert.ok(media.getAccessibleAsset(owner.id, asset.id, { includeDeleted: false }));
});

test('generation completion automatically creates a generated asset and reference input', async () => {
  const generationId = 'asset-generation-test';
  const storagePath = `${owner.id}/${generationId}.png`;
  const filePath = path.join(process.env.LOCAL_STORAGE_ROOT, storagePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#a78bfa' } }).png().toFile(filePath);
  const fileSize = fs.statSync(filePath).size;
  db.getDb().prepare(`
    INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at)
    VALUES (?, ?, 'generated asset prompt', 'gpt-image-2', '1024x1024', 'medium', 'test', 'processing', ?, datetime('now'))
  `).run(generationId, owner.id, storagePath);
  db.updateGeneration(generationId, {
    status: 'succeeded',
    file_size: fileSize,
    mime_type: 'image/png',
    completed_at: new Date().toISOString()
  });
  const asset = media.listAssets(owner.id, { sourceType: 'generated' }).assets.find((item) => item.sourceId === generationId);
  assert.ok(asset);
  assert.equal(asset.mediaType, 'image');
  assert.equal(asset.fileSize, fileSize);
  const normalized = references.normalizeReferenceRequests([{ assetId: asset.id, annotations: [] }]);
  const inputs = await references.loadReferenceImageInputs(owner.id, normalized, { model: 'gpt-image-2' });
  assert.equal(inputs.length, 1);
  assert.match(inputs[0], /^data:image\/png;base64,/);
});

test('legacy generated assets repair their real storage size for details and quota totals', async () => {
  const generationId = 'legacy-zero-size-generation';
  const storagePath = `${owner.id}/${generationId}.png`;
  const filePath = path.join(process.env.LOCAL_STORAGE_ROOT, storagePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 816, height: 816, channels: 3, background: '#14b8a6' } }).png().toFile(filePath);
  const actualSize = fs.statSync(filePath).size;
  db.getDb().prepare(`
    INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at)
    VALUES (?, ?, 'legacy generated prompt', 'gpt-image-2', '816x816', 'low', 'test', 'processing', ?, datetime('now'))
  `).run(generationId, owner.id, storagePath);
  db.updateGeneration(generationId, { status: 'succeeded', completed_at: new Date().toISOString() });
  const assetId = `generation-${generationId}`;
  assert.equal(media.getAccessibleAsset(owner.id, assetId).fileSize, 0);

  assert.equal(await media.repairAssetFileMetadata(owner.id, assetId), true);
  assert.equal(media.getAccessibleAsset(owner.id, assetId).fileSize, actualSize);
  assert.ok(media.getAssetStats(owner.id).totalBytes >= actualSize);
  assert.equal(
    db.getDb().prepare(`SELECT file_size FROM asset_variants WHERE asset_id = ? AND variant_type = 'original'`).get(assetId).file_size,
    actualSize
  );
});

test('video and audio uploads create playable preview variants', { timeout: 120000 }, async () => {
  const videoPath = path.join(tempDirectory, 'sample.mp4');
  const audioPath = path.join(tempDirectory, 'sample.wav');
  await execFileAsync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=0x14b8a6:s=320x240:d=0.7', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.7', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', videoPath], { windowsHide: true });
  await execFileAsync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=0.7', audioPath], { windowsHide: true });
  const video = await media.createUploadedAsset(owner.id, { bytes: fs.readFileSync(videoPath), mimeType: 'video/mp4', fileName: 'sample.mp4' });
  const audio = await media.createUploadedAsset(owner.id, { bytes: fs.readFileSync(audioPath), mimeType: 'audio/wav', fileName: 'sample.wav' });
  assert.equal(video.mediaType, 'video');
  assert.ok(video.durationMs > 0);
  assert.ok(video.variants.some((variant) => variant.type === 'preview' && variant.mimeType === 'video/mp4'));
  assert.ok(video.variants.some((variant) => variant.type === 'poster'));
  assert.equal(audio.mediaType, 'audio');
  assert.ok(audio.durationMs > 0);
  assert.ok(audio.variants.some((variant) => variant.type === 'preview' && variant.mimeType === 'audio/mpeg'));
  assert.ok(audio.variants.some((variant) => variant.type === 'waveform'));
  const stats = media.getAssetStats(owner.id);
  assert.ok(stats.videoBytes >= video.fileSize);
  assert.ok(stats.audioBytes >= audio.fileSize);
  assert.equal(stats.totalBytes, stats.imageBytes + stats.videoBytes + stats.audioBytes);
});
