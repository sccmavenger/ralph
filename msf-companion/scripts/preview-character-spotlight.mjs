// Isolated, explicitly requested design sample. Never invokes an app campaign.
// Prepare: node scripts/preview-character-spotlight.mjs --prepare
// Send once: node scripts/preview-character-spotlight.mjs --send
// Check: node scripts/preview-character-spotlight.mjs --status
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { Resend } from 'resend';
import { buildSpotlightSampleHtml, buildSpotlightSampleText } from './character-spotlight-sample-template.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: [path.join(appDir, '.env.local'), path.join(appDir, '.env')], quiet: true });
const outputDir = path.resolve(appDir, '../artifacts/character-spotlight-sample');
const recipient = 'dguilloryjr@msn.com';
const subject = '[SAMPLE] Character Spotlight - Spider-Man | Option 1';
const recipientHash = createHash('sha256').update(recipient).digest('hex');
const idempotencyKey = createHash('sha256').update(`requested-spotlight-sample:option1:SpiderMan:v1:${recipientHash}`).digest('hex');
const receiptPath = path.join(outputDir, 'receipt.json');
const digest = value => createHash('sha256').update(value).digest('hex');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function officialImage(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'assets.marvelstrikeforce.com');
  assert.equal(url.username + url.password, '');
  return url.href;
}

async function fetchCharacter() {
  const response = await fetch('https://hydra-public.prod.m3.scopelypv.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${required('SCOPELY_CLIENT_ID')}:${required('SCOPELY_CLIENT_SECRET')}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Scopely authentication failed (${response.status})`);
  const { access_token: token } = await response.json();
  assert.equal(typeof token, 'string');
  const dataResponse = await fetch('https://api.marvelstrikeforce.com/game/v1/characters/SpiderMan?lang=en&abilityKits=full&costumes=full&gearTiers=none&traitFormat=object', {
    headers: { Authorization: `Bearer ${token}`, 'x-api-key': required('MSF_API_KEY'), 'User-Agent': 'MSFToolkit/2.0 (Requested Email Sample)' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!dataResponse.ok) throw new Error(`Character data unavailable (${dataResponse.status})`);
  const { data } = await dataResponse.json();
  assert.equal(data.id, 'SpiderMan');
  const costume = Object.values(data.costumes ?? {}).find(item => item.name === 'No Way Home' && item.fullArt);
  assert.ok(costume, 'Verified No Way Home full-body artwork must be available');
  const abilities = ['basic', 'special', 'ultimate', 'passive'].map(type => {
    const ability = data.abilityKit?.[type];
    const levels = Object.entries(ability?.levels ?? {}).filter(([key, level]) => Number.isFinite(Number(key)) && typeof level.description === 'string').sort(([a], [b]) => Number(b) - Number(a));
    assert.ok(levels.length && ability.name && ability.icon, `Complete ${type} ability is required`);
    const [level, details] = levels[0];
    return { type, name: ability.name, icon: officialImage(ability.icon), level: Number(level), description: details.description };
  });
  return {
    id: data.id, name: data.name, portrait: officialImage(data.portrait),
    traits: data.traits, costume: { name: costume.name, fullArt: officialImage(costume.fullArt) },
    abilities, fetchedAt: new Date().toISOString(),
  };
}

async function prepare() {
  const character = await fetchCharacter();
  await mkdir(path.join(outputDir, 'assets'), { recursive: true });
  const sources = [
    { key: 'hero', url: character.costume.fullArt },
    { key: 'portrait', url: character.portrait },
    ...character.abilities.map(ability => ({ key: ability.type, url: ability.icon })),
  ];
  const assets = [];
  for (const source of sources) {
    const response = await fetch(officialImage(source.url), { signal: AbortSignal.timeout(25_000), redirect: 'error' });
    assert.ok(response.ok, `Artwork ${source.key} returned ${response.status}`);
    const type = response.headers.get('content-type')?.split(';')[0];
    assert.ok(['image/jpeg', 'image/png'].includes(type), 'Only email-compatible JPEG/PNG artwork is allowed');
    const content = Buffer.from(await response.arrayBuffer());
    assert.ok(content.length > 0 && content.length <= 3_000_000, 'Artwork size outside preview limits');
    const filename = `${source.key}.${type === 'image/jpeg' ? 'jpg' : 'png'}`;
    await writeFile(path.join(outputDir, 'assets', filename), content);
    assets.push({ ...source, filename, contentType: type, contentId: `spotlight-${source.key}`, sha256: digest(content), bytes: content.length });
  }
  const assetFor = url => {
    const asset = assets.find(item => item.url === url);
    assert.ok(asset, 'All sample images must be verified assets');
    return asset;
  };
  const html = buildSpotlightSampleHtml(character, { imageSource: url => `cid:${assetFor(url).contentId}` });
  const preview = buildSpotlightSampleHtml(character, { imageSource: url => `assets/${assetFor(url).filename}` });
  const text = buildSpotlightSampleText(character);
  assert.ok(Buffer.byteLength(html) < 90_000, 'Avoid email HTML clipping');
  assert.ok(!/<script|<form|onerror=|javascript:/i.test(html), 'Email must contain no active content');
  assert.ok(!/<color=/i.test(html), 'Game color markup must be formatted for email');
  await writeFile(path.join(outputDir, 'preview.html'), preview);
  await writeFile(path.join(outputDir, 'email.html'), html);
  await writeFile(path.join(outputDir, 'email.txt'), text);
  await writeFile(path.join(outputDir, 'character.json'), JSON.stringify(character, null, 2));
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ recipient, subject, idempotencyKey, htmlHash: digest(html), textHash: digest(text), assets, fetchedAt: character.fetchedAt }, null, 2));
  console.log(JSON.stringify({ prepared: true, recipient, subject, preview: path.join(outputDir, 'preview.html'), htmlBytes: Buffer.byteLength(html), artworkBytes: assets.reduce((sum, item) => sum + item.bytes, 0), abilities: character.abilities.map(item => `${item.type}: level ${item.level}`), sent: false }, null, 2));
}

async function checkHardSuppression() {
  const pool = new pg.Pool({ connectionString: required('DATABASE_URL'), max: 1, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });
  try {
    const result = await pool.query('SELECT 1 FROM "EmailDelivery" WHERE "recipientHash" = $1 AND (status IN (\'bounced\', \'complained\') OR (status = \'suppressed\' AND "attemptCount" > 0)) LIMIT 1', [recipientHash]);
    assert.equal(result.rowCount, 0, 'Recipient has a prior hard delivery suppression; no sample sent');
  } finally {
    await pool.end();
  }
}

async function send() {
  try {
    await access(receiptPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return sendPrepared();
  }
  throw new Error('A send receipt already exists. Use --status; do not send a duplicate sample.');
}

async function sendPrepared() {
  const manifest = JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
  const html = await readFile(path.join(outputDir, 'email.html'), 'utf8');
  const text = await readFile(path.join(outputDir, 'email.txt'), 'utf8');
  assert.equal(manifest.recipient, recipient);
  assert.equal(manifest.subject, subject);
  assert.equal(manifest.idempotencyKey, idempotencyKey);
  assert.equal(manifest.htmlHash, digest(html));
  assert.equal(manifest.textHash, digest(text));
  const attachments = [];
  for (const asset of manifest.assets) {
    assert.equal(path.basename(asset.filename), asset.filename);
    const content = await readFile(path.join(outputDir, 'assets', asset.filename));
    assert.equal(digest(content), asset.sha256);
    attachments.push({ filename: asset.filename, content, contentType: asset.contentType, contentId: asset.contentId });
  }
  const resend = new Resend(required('RESEND_API_KEY'));
  await checkHardSuppression();
  const receipt = { recipient, subject, idempotencyKey, requestedAt: new Date().toISOString(), status: 'attempting' };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'MSF Companion <info@themsftoolkit.com>',
    replyTo: process.env.EMAIL_REPLY_TO || 'info@themsftoolkit.com',
    to: [recipient], subject, html, text, attachments,
    tags: [{ name: 'application', value: 'msf-toolkit-preview' }, { name: 'message_type', value: 'requested_design_sample' }],
  }, { idempotencyKey });
  if (error || !data?.id) {
    await writeFile(receiptPath, JSON.stringify({ ...receipt, status: 'not_confirmed', providerErrorName: error?.name ?? null }, null, 2));
    throw new Error(`Sample not confirmed by provider (${error?.name ?? 'missing message ID'}); receipt retained to prevent duplicate sends`);
  }
  await writeFile(receiptPath, JSON.stringify({ ...receipt, status: 'accepted', providerMessageId: data.id }, null, 2));
  console.log(JSON.stringify({ accepted: true, recipient, subject, providerMessageId: data.id, campaignChanged: false }, null, 2));
}

async function status() {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.ok(receipt.providerMessageId, `No provider message ID; stored status is ${receipt.status}`);
  const { data, error } = await new Resend(required('RESEND_API_KEY')).emails.get(receipt.providerMessageId);
  if (error) {
    console.log(JSON.stringify({ recipient, providerMessageId: receipt.providerMessageId, status: receipt.status, deliveryStatusUnavailable: error.name }, null, 2));
    return;
  }
  const deliveryEvent = data?.last_event ?? 'unknown';
  await writeFile(receiptPath, JSON.stringify({ ...receipt, lastEvent: deliveryEvent, checkedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ recipient, subject, providerMessageId: receipt.providerMessageId, lastEvent: deliveryEvent }, null, 2));
}

const mode = process.argv[2];
if (!['--prepare', '--send', '--status'].includes(mode) || process.argv.length !== 3) {
  throw new Error('Choose exactly one: --prepare, --send, or --status');
}
await ({ '--prepare': prepare, '--send': send, '--status': status })[mode]();
