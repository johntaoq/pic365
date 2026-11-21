import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { Readable } from 'node:stream';

const directory = fs.mkdtempSync(path.join(os.tmpdir(),'pic365-source-storage-'));
Object.assign(process.env, {
  APP_DB_PATH:path.join(directory,'app.sqlite'), LOCAL_STORAGE_ROOT:path.join(directory,'assets'),
  PROVIDER_CONFIG_SECRET:'isolated-storage-test-secret', NEWAPI16_ORIGIN:'http://127.0.0.1:16429',
  NEWAPI16_CLIENT_SECRET:'isolated-storage-service-secret-at-least-32-characters',
  NEWAPI16_STORAGE_ENABLED:'true', NEWAPI40_STORAGE_ENABLED:'true',
  NEWAPI40_ORIGIN:'http://127.0.0.1:16430', NEWAPI40_CLIENT_SECRET:'isolated-storage-service-secret-40-at-least-32-characters',
  APP_URL:'http://127.0.0.1:16431', AZURE_STORAGE_CONNECTION_STRING:''
});
const db = await import('../api/_lib/local-db.js');
const external = await import('../api/_lib/newapi-account.js');
const storage = await import('../api/_lib/newapi-storage-billing.js');
const billing = await import('../api/_lib/storage-billing.js');
const { default: handler } = await import('../api/newapi-storage.js');
const { storageBillingDateParts } = await import('../shared/storage-billing.js');
const imageProvider=db.saveImageProviderConfig({name:'Storage test image engine',model:'gpt-image-2',
  baseUrl:'https://image-provider.invalid',apiKey:'isolated-unused-provider-key',isDefault:true});
db.bindDefaultSystemGroupChannel('image',imageProvider.id);
const originalFetch = globalThis.fetch;
let loseResponse = false, failBalance = false, available = true, charges = 0;
const receipts = new Map();
const mandates = new Map();
const invoiceOwners = new Map();
const json = (status, data) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch = async (url,options={}) => {
  const parsed = new URL(url);
  assert.ok([process.env.NEWAPI16_ORIGIN,process.env.NEWAPI40_ORIGIN].includes(parsed.origin),'no real network or inference requests');
  const action = parsed.pathname.split('/').at(-1);
  const body = options.body ? JSON.parse(options.body) : null;
  if (action==='capabilities') return available ? json(200,{success:true,data:{version:1,category:'pic365_storage',billing_source:'wallet'}}) : json(503,{success:false,error:'PIC365_STORAGE_UNAVAILABLE'});
  if (action==='balance') return json(200,{success:true,data:{quota:5000000,quota_per_unit:500000,billing_source:'wallet'}});
  if (action==='authorize') {
    assert.ok(options.headers['X-Pic365-Grant']);
    assert.equal(body.consent,true,'protocol acknowledgement stays on the authenticated server');
    const credential = randomUUID()+randomUUID();
    const mandate = {id:randomUUID(),created_at:Math.floor(Date.now()/1000),expires_at:Math.floor(Date.now()/1000)+body.days*86400,
      revoked_at:0,monthly_limit_cents:body.monthly_limit_cents,unit_price_cents_per_gib:body.unit_price_cents_per_gib};
    const owner=options.headers.Authorization;
    for (const previous of mandates.values()) if (previous.owner===owner) previous.revoked_at=Math.floor(Date.now()/1000);
    mandates.set(credential,{...mandate,owner});
    return json(200,{success:true,data:{mandate,credential}});
  }
  const credential = options.headers['X-Pic365-Storage'];
  assert.ok(mandates.has(credential));
  const mandate=mandates.get(credential);
  if (action==='status') {
    if (body.invoice_id) return receipts.has(body.invoice_id) ? json(200,{success:true,data:receipts.get(body.invoice_id)}) : json(404,{success:false,error:'PIC365_STORAGE_INVOICE_NOT_FOUND'});
    const {owner,...publicMandate}=mandate;
    return json(200,{success:true,data:{mandate:publicMandate,active:!mandate.revoked_at && mandate.expires_at>Math.floor(Date.now()/1000)}});
  }
  if (action==='revoke') { mandate.revoked_at=Math.floor(Date.now()/1000);return json(200,{success:true}); }
  assert.equal(action,'charge');
  if (receipts.has(body.invoice_id)) return json(200,{success:true,data:receipts.get(body.invoice_id)});
  if (mandate.revoked_at || mandate.expires_at<=Math.floor(Date.now()/1000)) return json(401,{success:false,error:'PIC365_STORAGE_AUTHORIZATION_REQUIRED'});
  if (failBalance) return json(402,{success:false,error:'PIC365_STORAGE_INSUFFICIENT_BALANCE'});
  const previous = [...receipts.values()].filter(receipt=>invoiceOwners.get(receipt.invoice_id)===mandate.owner && receipt.billing_month===body.billing_month).reduce((sum,receipt)=>sum+receipt.amount_cents,0);
  const amount = body.target_cents-previous;
  if (body.target_cents>mandate.monthly_limit_cents) return json(402,{success:false,error:'PIC365_STORAGE_MONTHLY_LIMIT'});
  const quota = Math.ceil(amount/100/7*500000);
  const receipt = {...body,amount_cents:amount,quota,quota_per_usd:500000,cny_per_usd:7,balance_before:5000000,balance_after:5000000-quota,log_published:true};
  receipts.set(body.invoice_id,receipt);invoiceOwners.set(body.invoice_id,mandate.owner);charges++;
  if (loseResponse) { loseResponse=false;throw new Error('simulated lost payment response'); }
  return json(200,{success:true,data:receipt});
};
after(()=>{globalThis.fetch=originalFetch;db.getDb().close();fs.rmSync(directory,{recursive:true,force:true});});

function account(sourceId='newapi16') {
  return external.saveNewAPIAccount({issuer:external.getNewAPIConfig(sourceId).origin,subject:randomUUID(),user_id:2,username:'storage-test',
    token_id:41,access_token:`sk-${randomUUID().replaceAll('-','')}${randomUUID().replaceAll('-','').slice(0,16)}`,grant_binding:'b'.repeat(43),expires_at:Math.floor(Date.now()/1000)+3600,
    group:'default',models:['gpt-image-2'],billing_source:'wallet'},external.getNewAPIConfig(sourceId));
}
async function invoice(userId,ownedBytes=2**30) {
  return billing.billUserStorageForDate({userId,runDate:storageBillingDateParts().date,ownedBytes,unitPriceCentsPerGb:300});
}
async function invoke(userId,method='GET',body={},origin=process.env.APP_URL) {
  const session=db.createSession(userId);
  let status,payload;
  await handler({method,body,headers:{cookie:`member_session=${session.token}`,origin}},
    {setHeader(){},status(value){status=value;return this;},json(value){payload=value;return this;}});
  return {status,payload};
}

test('disabled source storage never charges, starts a grace period or falls back to local credits', async () => {
  const userId=account('newapi40');
  const beforeCharges=charges;
  process.env.NEWAPI40_STORAGE_ENABLED='false';
  try {
    assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(userId));
    const result=await invoice(userId);
    assert.equal(result.status,'external_disabled');
    assert.equal(charges,beforeCharges);
    assert.equal(db.getDb().prepare('SELECT COUNT(*) AS n FROM newapi_storage_authorizations WHERE user_id=?').get(userId).n,0);
    assert.equal(db.getDb().prepare('SELECT COUNT(*) AS n FROM newapi_storage_invoices WHERE user_id=?').get(userId).n,0);
    assert.equal(db.getDb().prepare('SELECT COUNT(*) AS n FROM credit_ledger WHERE user_id=?').get(userId).n,0);
    await assert.rejects(()=>storage.authorizeNewAPIStorage(userId,{monthlyLimitCents:1000,days:30,consent:true},300),{code:'PIC365_STORAGE_UNAVAILABLE'});
  } finally { process.env.NEWAPI40_STORAGE_ENABLED='true'; }
})

test('automatic source billing needs no user consent, retains same-origin protection and ignores client rates and caps',async()=>{
  const userId=account();
  const count=charges;
  assert.equal(storage.getNewAPIStorageSummary(userId).state,'authorization_required');
  assert.equal(storage.getNewAPIStorageSummary(userId).automaticPayment,true);
  assert.equal((await invoke(userId,'POST',{consent:true,days:30,monthlyLimitCents:1000},'http://attacker.invalid')).status,403);
  const result=await invoke(userId,'POST',{consent:false,days:365,monthlyLimitCents:10000000,unitPriceCentsPerGib:1});
  assert.equal(result.status,200);
  assert.equal(result.payload.storage.state,'active');
  assert.equal(result.payload.storage.monthlyLimitCents,1000);
  assert.equal(result.payload.storage.unitPriceCentsPerGib,300);
  assert.equal(charges,count,'preparing automatic settlement does not charge without usage');
  assert.equal((await invoke(userId,'DELETE')).status,405,'the old opt-out endpoint is not exposed');
  await invoice(userId);
  assert.equal(charges,count+1);
  await assert.rejects(storage.authorizeNewAPIStorage(userId,{consent:false,days:30,monthlyLimitCents:1000},300),/INVALID_CONSENT/);
});

test('a missing settlement credential or unavailable source never starts a seven-day consent deadline',async()=>{
  const userId=account();
  const count=charges;
  assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(userId));
  db.getDb().prepare('UPDATE newapi_storage_authorizations SET blocked_since=? WHERE user_id=?')
    .run(new Date(Date.now()-8*86400_000).toISOString(),userId);
  available=false;
  try {
    await invoice(userId);
    assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(userId));
    await assert.doesNotReject(()=>external.requireNewAPIImageBalance(userId));
    assert.doesNotThrow(()=>external.reserveNewAPIImage(userId,{metadata:{providerId:'newapi16:gpt-image-2',model:'gpt-image-2'},requestKey:'legacy-no-consent'}));
    assert.equal(storage.getNewAPIStorageSummary(userId).blockedSince,null);
    assert.equal(storage.getNewAPIStorageSummary(userId).invoices.length,0);
    assert.equal(db.getDb().prepare("SELECT COUNT(*) AS n FROM notification_events WHERE type='storage_payment' AND recipient_user_id=?").get(userId).n,0);
    await assert.rejects(storage.ensureAutomaticNewAPIStorage(userId),/UNAVAILABLE/);
  } finally { available=true; }
  assert.equal(charges,count);
});

test('source wallet charges never debit Pic365 credits and duplicate measurements remain idempotent',async()=>{
  const userId=account();
  const count=charges;
  await invoice(userId);
  await invoice(userId);
  assert.equal(charges,count+1);
  assert.equal(db.getUserById(userId).creditBalance,0);
  assert.equal(db.listCreditLedger(userId,10).length,0);
  const summary=storage.getNewAPIStorageSummary(userId);
  assert.equal(summary.invoices[0].receipt.amount_cents,300);
  assert.equal(summary.invoices[0].status,'paid');
  assert.equal(JSON.stringify(summary).includes('credential'),false);
  assert.equal([...mandates.keys()].some(secret=>JSON.stringify(summary).includes(secret)),false);
  const row=db.getDb().prepare('SELECT credential_encrypted FROM newapi_storage_authorizations WHERE user_id=?').get(userId);
  assert.equal([...mandates.keys()].some(secret=>row.credential_encrypted.includes(secret)),false);
});

test('lost payment responses recover the original receipt without a second charge, even after login expiry',async()=>{
  const userId=account();
  await storage.authorizeNewAPIStorage(userId,{consent:true,days:30,monthlyLimitCents:1000},300);
  db.getDb().prepare('UPDATE newapi_accounts SET expires_at=1 WHERE user_id=?').run(userId);
  const count=charges;
  loseResponse=true;
  await invoice(userId);
  const first=storage.getNewAPIStorageSummary(userId).invoices[0];
  assert.equal(first.status,'pending');
  assert.equal(storage.getNewAPIStorageSummary(userId).blockedSince,null);
  await storage.retryNewAPIStorageInvoices({userId});
  const last=storage.getNewAPIStorageSummary(userId).invoices[0];
  assert.equal(last.id,first.id);
  assert.equal(last.status,'paid');
  assert.equal(charges,count+1);
});

test('insufficient balance triggers a scoped alert and grace period before blocking new storage',async()=>{
  const userId=account('newapi40');
  await storage.authorizeNewAPIStorage(userId,{consent:true,days:30,monthlyLimitCents:1000},300);
  failBalance=true;
  await invoice(userId);
  assert.equal(storage.getNewAPIStorageSummary(userId).invoices[0].status,'blocked');
  assert.equal(db.getUserById(userId).creditBalance,0);
  assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(userId));
  const notification=db.getDb().prepare("SELECT * FROM notification_events WHERE type='storage_payment' AND recipient_user_id=?").get(userId);
  assert.equal(notification.audience,'user');
  db.getDb().prepare('UPDATE newapi_storage_authorizations SET blocked_since=? WHERE user_id=?').run(new Date(Date.now()-8*86400_000).toISOString(),userId);
  db.getDb().prepare('UPDATE newapi_storage_invoices SET created_at=? WHERE user_id=?').run(new Date(Date.now()-8*86400_000).toISOString(),userId);
  assert.throws(()=>storage.requireNewAPIStorageWrite(userId),/PAYMENT_REQUIRED/);
  assert.throws(()=>external.reserveNewAPIImage(userId,{metadata:{providerId:'newapi40:gpt-image-2',model:'gpt-image-2'},requestKey:'blocked-test'}),/PAYMENT_REQUIRED/);
  failBalance=false;
  await storage.retryNewAPIStorageInvoices({userId});
  assert.equal(storage.getNewAPIStorageSummary(userId).invoices[0].status,'paid');
  assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(userId));
});

test('source revocation stops new charges, credential expiration alone never blocks writes, and native billing is unchanged',async()=>{
  const userId=account();
  await storage.authorizeNewAPIStorage(userId,{consent:true,days:30,monthlyLimitCents:1000},300);
  await storage.revokeNewAPIStorage(userId);
  const count=charges;
  await invoice(userId);
  assert.equal(charges,count);
  assert.equal(storage.getNewAPIStorageSummary(userId).state,'revoked');
  await storage.ensureAutomaticNewAPIStorage(userId);
  assert.equal(storage.getNewAPIStorageSummary(userId).state,'revoked','explicit revocation is not silently reversed');
  await storage.authorizeNewAPIStorage(userId,{consent:true,days:30,monthlyLimitCents:1000},300);
  db.getDb().prepare('UPDATE newapi_storage_authorizations SET expires_at=?,blocked_since=NULL WHERE user_id=?').run(Math.floor(Date.now()/1000)-8*86400,userId);
  assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(userId));
  await storage.ensureAutomaticNewAPIStorage(userId);
  assert.equal(storage.getNewAPIStorageSummary(userId).state,'active','the system prepares a fresh credential without a browser consent action');
  const native=db.createUser({email:'native-storage@example.test',password:'local-test-password',initialCredits:1000});
  const result=billing.billUserStorageForDate({userId:native.id,runDate:storageBillingDateParts().date,ownedBytes:2**30,unitPriceCentsPerGb:300});
  assert.equal(result.chargedCredits,300);
  assert.equal(db.getUserById(native.id).creditBalance,700);
  assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(native.id));
});

test('storage endpoint returns only the authenticated user receipts and no payment secrets',async()=>{
  const owner=account(), other=account();
  await storage.authorizeNewAPIStorage(owner,{consent:true,days:30,monthlyLimitCents:1000},300);
  await invoice(owner);
  const result=await invoke(other);
  assert.equal(result.status,200);
  assert.equal(result.payload.storage.invoices.length,0);
  assert.equal(JSON.stringify(result.payload).includes('credential_encrypted'),false);
});

test('legacy source users enroll automatically; peaks recorded before enrollment do not create retrospective debt',async()=>{
  const userId=account();
  db.getDb().prepare('UPDATE users SET created_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',userId);
  assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(userId));
  const date=storageBillingDateParts().date;
  db.getDb().prepare(`INSERT INTO storage_billing_daily_usage
    (user_id,usage_date,billing_month,run_phase,owned_bytes,owned_asset_count,result_status,incremental_credits,balance_before,balance_after,measured_at)
    VALUES (?, ?, ?, 'daily', ?, 1, 'external_newapi', 0, 0, 0, ?)`)
    .run(userId,date,date.slice(0,7),2**31,new Date(Date.now()-3600000).toISOString());
  await invoice(userId,2**30);
  assert.equal(storage.getNewAPIStorageSummary(userId).invoices[0].receipt.amount_cents,300);
});

test('the settlement retry HTTP stream accepts an empty object, rejects malformed or oversized bodies and needs no consent',async()=>{
  const userId=account();
  const session=db.createSession(userId);
  for (const [body,expected] of [['{}',200],['{',400],['x'.repeat(8193),413]]) {
    const req=Readable.from([Buffer.from(body)]);
    req.method='POST';req.headers={cookie:`member_session=${session.token}`,origin:process.env.APP_URL,'content-type':'application/json'};
    let status;
    await handler(req,{setHeader(){},status(value){status=value;return this;},json(){return this;}});
    assert.equal(status,expected);
  }
  assert.equal(storage.getNewAPIStorageSummary(userId).state,'active');
});

test('automatic setup is single-flight and renews with the existing cap without erasing the monthly peak',async()=>{
  const userId=account();
  const before=mandates.size;
  await Promise.all([storage.ensureAutomaticNewAPIStorage(userId),storage.ensureAutomaticNewAPIStorage(userId)]);
  assert.equal(mandates.size,before+1);
  await invoice(userId,2**31);
  const auth=db.getDb().prepare('SELECT * FROM newapi_storage_authorizations WHERE user_id=?').get(userId);
  const credential=[...mandates.keys()].find(value=>mandates.get(value).id===auth.mandate_id);
  const yesterday=storageBillingDateParts(new Date(Date.now()-86400_000)).date;
  if (yesterday.slice(0,7)===storageBillingDateParts().month) {
    db.getDb().prepare('UPDATE storage_billing_daily_usage SET usage_date=? WHERE user_id=?').run(yesterday,userId);
    db.getDb().prepare('UPDATE storage_billing_months SET created_at=? WHERE user_id=?').run(`${yesterday}T04:00:00.000Z`,userId);
  }
  const expiresAt=Math.floor(Date.now()/1000)+3600;
  db.getDb().prepare('UPDATE newapi_storage_authorizations SET starts_at=?,expires_at=?,monthly_limit_cents=750 WHERE user_id=?')
    .run(expiresAt-30*86400,expiresAt,userId);
  mandates.get(credential).monthly_limit_cents=750;
  const count=charges;
  await storage.ensureAutomaticNewAPIStorage(userId);
  assert.equal(mandates.size,before+2);
  assert.equal(storage.getNewAPIStorageSummary(userId).monthlyLimitCents,750);
  await invoice(userId);
  assert.equal(charges,count,'a renewed credential does not charge the same peak again');
  assert.equal(storage.getNewAPIStorageSummary(userId).peakBytes,2**31);
});

test('unknown payments and confirmed unpaid invoices cannot be cleared or reset by automatic setup',async()=>{
  const uncertain=account();
  loseResponse=true;
  await invoice(uncertain);
  const pending=storage.getNewAPIStorageSummary(uncertain).invoices[0];
  const before=mandates.size;
  db.getDb().prepare('UPDATE newapi_storage_authorizations SET expires_at=? WHERE user_id=?')
    .run(Math.floor(Date.now()/1000)+3600,uncertain);
  await storage.ensureAutomaticNewAPIStorage(uncertain);
  assert.equal(mandates.size,before);
  assert.equal(storage.getNewAPIStorageSummary(uncertain).invoices[0].id,pending.id);
  assert.equal(storage.getNewAPIStorageSummary(uncertain).invoices[0].status,'pending');
  await storage.retryNewAPIStorageInvoices({userId:uncertain});
  assert.equal(storage.getNewAPIStorageSummary(uncertain).invoices[0].status,'paid');

  const unpaid=account();
  failBalance=true;
  try { await invoice(unpaid); } finally { failBalance=false; }
  const unpaidInvoice=storage.getNewAPIStorageSummary(unpaid).invoices[0];
  const blockedSince=new Date(Date.now()-8*86400_000).toISOString();
  db.getDb().prepare('UPDATE newapi_storage_authorizations SET blocked_since=?,expires_at=1 WHERE user_id=?').run(blockedSince,unpaid);
  db.getDb().prepare('UPDATE newapi_storage_invoices SET created_at=? WHERE user_id=?').run(blockedSince,unpaid);
  const unpaidAuth=db.getDb().prepare('SELECT mandate_id FROM newapi_storage_authorizations WHERE user_id=?').get(unpaid);
  [...mandates.values()].find(value=>value.id===unpaidAuth.mandate_id).expires_at=1;
  await storage.retryNewAPIStorageInvoices({userId:unpaid});
  await storage.ensureAutomaticNewAPIStorage(unpaid);
  const retained=storage.getNewAPIStorageSummary(unpaid);
  assert.equal(retained.invoices[0].id,unpaidInvoice.id);
  assert.equal(retained.invoices[0].status,'blocked');
  assert.equal(retained.invoices[0].errorCode,'PIC365_STORAGE_INSUFFICIENT_BALANCE');
  assert.equal(retained.blockedSince,blockedSince);
  assert.throws(()=>storage.requireNewAPIStorageWrite(unpaid),/PAYMENT_REQUIRED/);
});

test('the source monthly cap is enforced and source-side revocation is not undone by automatic renewal',async()=>{
  const capped=account();
  await invoice(capped,4*2**30);
  assert.equal(storage.getNewAPIStorageSummary(capped).invoices[0].errorCode,'PIC365_STORAGE_MONTHLY_LIMIT');
  assert.ok(storage.getNewAPIStorageSummary(capped).blockedSince);
  const revoked=account();
  await storage.ensureAutomaticNewAPIStorage(revoked);
  const auth=db.getDb().prepare('SELECT * FROM newapi_storage_authorizations WHERE user_id=?').get(revoked);
  const mandate=[...mandates.values()].find(value=>value.id===auth.mandate_id);
  mandate.revoked_at=Math.floor(Date.now()/1000);
  db.getDb().prepare('UPDATE newapi_storage_authorizations SET expires_at=? WHERE user_id=?')
    .run(Math.floor(Date.now()/1000)+3600,revoked);
  const count=mandates.size;
  await storage.ensureAutomaticNewAPIStorage(revoked);
  assert.equal(mandates.size,count);
  assert.equal(storage.getNewAPIStorageSummary(revoked).state,'revoked');
});

test('same-day automatic renewal does not replace the original usage snapshot with a lower peak',async()=>{
  const userId=account();
  await invoice(userId,2**31);
  const auth=db.getDb().prepare('SELECT * FROM newapi_storage_authorizations WHERE user_id=?').get(userId);
  db.getDb().prepare('UPDATE newapi_storage_authorizations SET expires_at=? WHERE user_id=?')
    .run(Math.floor(Date.now()/1000)+3600,userId);
  db.getDb().prepare('UPDATE storage_billing_daily_usage SET measured_at=? WHERE user_id=?')
    .run(new Date(Date.now()-3600000).toISOString(),userId);
  const count=charges;
  await storage.ensureAutomaticNewAPIStorage(userId);
  await invoice(userId);
  assert.notEqual(db.getDb().prepare('SELECT mandate_id FROM newapi_storage_authorizations WHERE user_id=?').get(userId).mandate_id,auth.mandate_id);
  assert.equal(storage.getNewAPIStorageSummary(userId).peakBytes,2**31);
  assert.equal(charges,count);
});

test('automatic preparation covers every account over multiple bounded worker passes without charging',async()=>{
  const expected=db.getDb().prepare('SELECT user_id FROM newapi_accounts ORDER BY user_id').all().map(row=>row.user_id);
  const seen=new Set();
  const count=charges;
  for (let pass=0;pass<Math.ceil(expected.length/2);pass++) {
    const result=await storage.prepareAutomaticNewAPIStorage({limit:2});
    for (const row of result) seen.add(row.userId);
  }
  assert.deepEqual([...seen].sort(),expected.sort());
  assert.equal(charges,count,'worker enrollment never creates invoices without measured usage');
});

test('retrying an old paid receipt never erases a newer insufficient-balance grace period',async()=>{
  const userId=account();
  await invoice(userId);
  const paid=storage.getNewAPIStorageSummary(userId).invoices[0];
  receipts.get(paid.id).log_published=false;
  db.getDb().prepare('UPDATE newapi_storage_invoices SET receipt_json=? WHERE id=?')
    .run(JSON.stringify(receipts.get(paid.id)),paid.id);
  const auth=db.getDb().prepare('SELECT * FROM newapi_storage_authorizations WHERE user_id=?').get(userId);
  const request={...paid.request,invoice_id:randomUUID().replaceAll('-',''),peak_bytes:2**31,target_cents:600};
  db.getDb().prepare(`INSERT INTO newapi_storage_invoices
    (id,user_id,issuer,subject,mandate_id,credential_encrypted,billing_month,request_json,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,'pending',?)`).run(request.invoice_id,userId,auth.issuer,auth.subject,auth.mandate_id,
      auth.credential_encrypted,request.billing_month,JSON.stringify(request),new Date(Date.now()-9*86400_000).toISOString());
  const count=charges;
  failBalance=true;
  try { await storage.retryNewAPIStorageInvoices({userId}); } finally { failBalance=false; }
  const summary=storage.getNewAPIStorageSummary(userId);
  assert.ok(Date.parse(summary.blockedSince)>Date.now()-10000,'the actual payment failure starts a fresh grace period');
  assert.doesNotThrow(()=>storage.requireNewAPIStorageWrite(userId));
  assert.equal(charges,count);
  const alert=db.getDb().prepare("SELECT metadata_json FROM notification_events WHERE type='storage_payment' AND recipient_user_id=?").get(userId);
  assert.equal(JSON.parse(alert.metadata_json).error,'PIC365_STORAGE_INSUFFICIENT_BALANCE');
});
