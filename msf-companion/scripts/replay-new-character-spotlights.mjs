// User-requested replay of three specific delivered alerts. Never runs a campaign.
// Run with exactly one of --prepare, --send, --status.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Resend } from 'resend';
import { buildSpotlightSampleHtml, buildSpotlightSampleText } from './character-spotlight-sample-template.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: [path.join(appDir, '.env.local'), path.join(appDir, '.env')], quiet: true });
const outputDir = path.resolve(appDir, '../artifacts/character-spotlight-replays-2026-09-16');
const recipient = 'dguilloryjr@msn.com';
const originalAlerts = [
  { id: 'a0e13e73-3b91-4524-a816-79801e4e470e', name: 'Wasp (Janet)' },
  { id: '082774d3-7e53-470b-991e-fe16c7c78fdc', name: 'Elite S.H.I.E.L.D. Assault' },
  { id: '4d1a02b5-15a1-4502-baf5-35c5a1d20184', name: 'Elite S.H.I.E.L.D. Medic' },
];
const digest = value => createHash('sha256').update(value).digest('hex');
const keyFor = id => digest(`requested-spotlight-replay:option1:v1:${id}:${recipient}`);
const pause = () => new Promise(resolve => setTimeout(resolve, 650));
const required = name => { assert.ok(process.env[name], `${name} is not configured`); return process.env[name]; };
const resend = new Resend(required('RESEND_API_KEY'));
const subjectFor = name => `[PREVIEW] New Character Detected: ${name}`;

function decodeHtml(value) {
  return value.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function imageUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'assets.marvelstrikeforce.com');
  assert.equal(url.username + url.password, '');
  return url.href;
}

async function originalMessage(alert) {
  const { data, error } = await resend.emails.get(alert.id);
  if (error) throw new Error(`Could not retrieve original alert (${error.name})`);
  assert.ok(data.to?.some(to => to.trim().toLowerCase() === recipient), 'Original alert must belong to the requested recipient');
  assert.equal(data.subject, `New Character Detected: ${alert.name}`);
  assert.ok(['sent', 'delivered', 'opened', 'clicked'].includes(data.last_event), `Original provider delivery state is ${data.last_event}; do not replay`);
  const abilities = [...data.html.matchAll(/<tr><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/g)]
    .map(match => ({ name: decodeHtml(match[1]), description: decodeHtml(match[2]) }));
  const traits = decodeHtml(data.html.match(/Traits: ([^<]*)/)?.[1] ?? '').split(',').map(value => value.trim()).filter(Boolean);
  assert.ok(abilities.length >= 3 && abilities.length <= 4, 'Original kit must be parsed without dropping abilities');
  assert.ok(traits.length, 'Original traits must be available');
  // Intentionally omit original HTML/footer: it contains a signed unsubscribe URL.
  return { id: alert.id, name: alert.name, subject: data.subject, sentAt: new Date(data.created_at).toISOString(), providerStatus: data.last_event, abilities, traits };
}

async function gameAccess() {
  const response = await fetch('https://hydra-public.prod.m3.scopelypv.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${required('SCOPELY_CLIENT_ID')}:${required('SCOPELY_CLIENT_SECRET')}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials', signal: AbortSignal.timeout(25_000),
  });
  assert.ok(response.ok, `Scopely authentication returned ${response.status}`);
  const { access_token: token } = await response.json();
  assert.equal(typeof token, 'string');
  return async endpoint => {
    const result = await fetch(`https://api.marvelstrikeforce.com${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-api-key': required('MSF_API_KEY'), 'User-Agent': 'MSFToolkit/2.0 (Requested Alert Replay)' },
      signal: AbortSignal.timeout(25_000),
    });
    assert.ok(result.ok, `Official character data returned ${result.status}`);
    return result.json();
  };
}

async function findCharacters(game) {
  const found = new Map();
  for (let page = 1; page <= 40; page++) {
    const payload = await game(`/game/v1/characters?lang=en&page=${page}&perPage=50&abilityKits=none&costumes=none&gearTiers=none&traitFormat=object`);
    assert.ok(Array.isArray(payload.data), 'Expected a paginated character catalog');
    for (const character of payload.data) {
      if (originalAlerts.some(alert => alert.name === character.name)) found.set(character.name, character.id);
    }
    if (found.size === originalAlerts.length) break;
    if (page * (payload.meta?.perPage ?? 50) >= payload.meta?.perTotal || !payload.data.length) break;
  }
  assert.equal(found.size, originalAlerts.length, 'All original characters must be positively matched in official data');
  return found;
}

async function prepare() {
  // Do not overwrite a reviewed/sent generation on an accidental rerun.
  try { await access(path.join(outputDir, 'manifest.json')); throw new Error('Replay already prepared; review existing artifacts instead of regenerating'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const originals = [];
  for (const alert of originalAlerts) { originals.push(await originalMessage(alert)); await pause(); }
  const game = await gameAccess();
  const ids = await findCharacters(game);
  const entries = [];
  for (const original of originals) {
    const id = ids.get(original.name);
    const { data } = await game(`/game/v1/characters/${encodeURIComponent(id)}?lang=en&abilityKits=full&costumes=full&gearTiers=none&traitFormat=object`);
    assert.equal(data.name, original.name);
    const costume = data.costumes?.['0']; // Never silently substitute another costume.
    const character = {
      id, name: original.name, portrait: imageUrl(data.portrait),
      costume: costume?.fullArt ? { name: costume.name, fullArt: imageUrl(costume.fullArt) } : null,
      traits: original.traits.map(traitId => ({ id: traitId, name: data.traits?.find(trait => trait.id === traitId)?.name ?? traitId })),
      originalAlert: { id: original.id, subject: original.subject, sentAt: original.sentAt },
      fetchedAt: new Date().toISOString(),
      abilities: original.abilities.map(ability => {
        const matches = Object.entries(data.abilityKit ?? {}).filter(([, current]) => current?.name === ability.name);
        assert.equal(matches.length, 1, `Ability ${ability.name} must match exactly one official kit slot`);
        const [type, current] = matches[0];
        assert.ok(['basic', 'special', 'ultimate', 'passive'].includes(type));
        return { ...ability, type, icon: imageUrl(current.icon), level: null };
      }),
    };
    assert.match(id, /^[a-zA-Z0-9_-]+$/);
    const dir = path.join(outputDir, id);
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    const sources = [
      { key: 'hero', url: character.costume?.fullArt }, { key: 'portrait', url: character.portrait },
      ...character.abilities.map(ability => ({ key: ability.type, url: ability.icon })),
    ].filter(source => source.url);
    const assets = [];
    for (const source of sources) {
      const response = await fetch(imageUrl(source.url), { redirect: 'error', signal: AbortSignal.timeout(25_000) });
      if (response.status === 404) {
        console.log(JSON.stringify({ character: character.name, unavailableOfficialImage: source.key, status: 404 }));
        if (source.key === 'hero') character.costume = null;
        else if (source.key === 'portrait') character.portrait = null;
        else character.abilities.find(ability => ability.type === source.key).icon = null;
        continue;
      }
      assert.ok(response.ok, `Official artwork returned ${response.status}`);
      const contentType = response.headers.get('content-type')?.split(';')[0];
      assert.ok(['image/jpeg', 'image/png'].includes(contentType));
      const content = Buffer.from(await response.arrayBuffer());
      assert.ok(content.length > 0 && content.length <= 3_000_000);
      const filename = `${source.key}.${contentType === 'image/jpeg' ? 'jpg' : 'png'}`;
      await writeFile(path.join(dir, 'assets', filename), content);
      assets.push({ ...source, filename, contentType, contentId: `replay-${id}-${source.key}`, sha256: digest(content) });
    }
    const assetFor = url => { const asset = assets.find(item => item.url === url); assert.ok(asset); return asset; };
    const html = buildSpotlightSampleHtml(character, { imageSource: url => `cid:${assetFor(url).contentId}` });
    const preview = buildSpotlightSampleHtml(character, { imageSource: url => `assets/${assetFor(url).filename}` });
    const text = buildSpotlightSampleText(character);
    assert.ok(Buffer.byteLength(html) < 90_000);
    assert.ok(!/<script|<form|onerror=|javascript:|<color=/i.test(html));
    assert.ok(html.includes('REQUESTED RESEND'), 'Replay-specific template wording is required');
    assert.ok(!html.includes('existing character used to demonstrate'), 'Do not reuse Spider-Man demo language');
    await writeFile(path.join(dir, 'preview.html'), preview);
    await writeFile(path.join(dir, 'email.html'), html);
    await writeFile(path.join(dir, 'email.txt'), text);
    await writeFile(path.join(dir, 'character.json'), JSON.stringify(character, null, 2));
    entries.push({ id, name: character.name, originalId: original.id, originalSentAt: original.sentAt, subject: subjectFor(character.name), idempotencyKey: keyFor(original.id), htmlHash: digest(html), textHash: digest(text), assets, fullBodyAvailable: !!character.costume?.fullArt, abilityCount: character.abilities.length });
  }
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ recipient, entries }, null, 2));
  console.log(JSON.stringify({ prepared: true, recipient, entries: entries.map(({ assets, ...entry }) => entry), sent: false }, null, 2));
}

async function manifest() {
  const value = JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
  assert.equal(value.recipient, recipient);
  assert.equal(value.entries.length, originalAlerts.length);
  assert.deepEqual(value.entries.map(entry => entry.originalId).sort(), originalAlerts.map(alert => alert.id).sort());
  for (const entry of value.entries) {
    assert.match(entry.id, /^[a-zA-Z0-9_-]+$/);
    assert.equal(entry.name, originalAlerts.find(alert => alert.id === entry.originalId).name);
    assert.equal(entry.subject, subjectFor(entry.name));
    assert.equal(entry.idempotencyKey, keyFor(entry.originalId));
  }
  return value;
}

async function send() {
  const { entries } = await manifest();
  // Check every original before sending any message. Provider hard failures stop replay.
  for (const original of originalAlerts) { await originalMessage(original); await pause(); }
  for (const entry of entries) {
    const dir = path.join(outputDir, entry.id);
    const receiptPath = path.join(dir, 'receipt.json');
    try { await access(receiptPath); console.log(JSON.stringify({ skippedExistingReceipt: entry.name })); continue; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const html = await readFile(path.join(dir, 'email.html'), 'utf8');
    const text = await readFile(path.join(dir, 'email.txt'), 'utf8');
    assert.equal(digest(html), entry.htmlHash);
    assert.equal(digest(text), entry.textHash);
    const attachments = [];
    for (const asset of entry.assets) {
      assert.equal(path.basename(asset.filename), asset.filename);
      const content = await readFile(path.join(dir, 'assets', asset.filename));
      assert.equal(digest(content), asset.sha256);
      attachments.push({ filename: asset.filename, content, contentType: asset.contentType, contentId: asset.contentId });
    }
    const receipt = { recipient, subject: entry.subject, originalId: entry.originalId, idempotencyKey: entry.idempotencyKey, requestedAt: new Date().toISOString(), status: 'attempting' };
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'MSF Companion <info@themsftoolkit.com>',
      replyTo: process.env.EMAIL_REPLY_TO || 'info@themsftoolkit.com',
      to: [recipient], subject: entry.subject, html, text, attachments,
      tags: [{ name: 'application', value: 'msf-toolkit-preview' }, { name: 'message_type', value: 'requested_alert_replay' }],
    }, { idempotencyKey: entry.idempotencyKey });
    if (error || !data?.id) {
      await writeFile(receiptPath, JSON.stringify({ ...receipt, status: 'not_confirmed', providerErrorName: error?.name ?? null }, null, 2));
      throw new Error(`Replay not confirmed (${error?.name ?? 'missing provider ID'}); stopped without retry`);
    }
    await writeFile(receiptPath, JSON.stringify({ ...receipt, status: 'accepted', providerMessageId: data.id }, null, 2));
    console.log(JSON.stringify({ accepted: true, recipient, subject: entry.subject, providerMessageId: data.id }));
    await pause();
  }
}

async function status() {
  const { entries } = await manifest();
  for (const entry of entries) {
    const receiptPath = path.join(outputDir, entry.id, 'receipt.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    assert.ok(receipt.providerMessageId, `No confirmed send ID for ${entry.name}`);
    const { data, error } = await resend.emails.get(receipt.providerMessageId);
    if (error) { console.log(JSON.stringify({ name: entry.name, status: receipt.status, statusUnavailable: error.name })); continue; }
    await writeFile(receiptPath, JSON.stringify({ ...receipt, lastEvent: data.last_event, checkedAt: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify({ name: entry.name, recipient, providerMessageId: receipt.providerMessageId, lastEvent: data.last_event }));
    await pause();
  }
}

const mode = process.argv[2];
assert.ok(['--prepare', '--send', '--status'].includes(mode) && process.argv.length === 3, 'Choose exactly one: --prepare, --send, --status');
await ({ '--prepare': prepare, '--send': send, '--status': status })[mode]();
