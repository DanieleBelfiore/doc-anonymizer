// The contact form of the public page (netlify/functions/contact.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../netlify/functions/contact.mjs';

const ENV = { RESEND_API_KEY: 're_test', CONTACT_TO: 'owner@example.com', CONTACT_FROM: 'Doc Anonymizer <doc@example.com>' };

function setup({ env = ENV, sendOk = true, store = memoryStore(), clock = { t: 0 } } = {}) {
  const sent = [];
  const handle = createHandler({
    env,
    send: async email => { sent.push(email); return sendOk; },
    store,
    now: () => clock.t,
  });
  return { handle, sent, clock };
}

/** Stands in for the Netlify Blobs store. */
function memoryStore() {
  const data = new Map();
  return { get: async key => data.get(key) ?? null, set: async (key, value) => { data.set(key, value); } };
}

function post(fields, { json = true, ip = '1.2.3.4' } = {}) {
  const body = new URLSearchParams({ name: 'Ada Lovelace', email: 'ada@example.com', message: 'Funziona anche con i PDF scansionati?', ...fields });
  const req = new Request('https://doc-anonymizer.example/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(json ? { accept: 'application/json' } : {}) },
    body,
  });
  return [req, { ip }];
}

test('a valid message mails the owner, with reply-to the sender', async () => {
  const { handle, sent } = setup();
  const res = await handle(...post({}));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['owner@example.com']);
  assert.equal(sent[0].from, 'Doc Anonymizer <doc@example.com>');
  assert.equal(sent[0].reply_to, 'ada@example.com');
  assert.match(sent[0].subject, /Ada Lovelace/);
  assert.match(sent[0].text, /PDF scansionati/);
});

test('the honeypot field fakes success and sends nothing', async () => {
  const { handle, sent } = setup();
  const res = await handle(...post({ website: 'http://spam.example' }));
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

test('a bad email, a missing name or message, or a huge message is refused', async () => {
  const { handle, sent } = setup();
  const cases = [{ email: 'not-an-email' }, { name: '  ' }, { message: ' ' }, { message: 'x'.repeat(3001) }, { name: 'x'.repeat(101) }];
  for (const [i, fields] of cases.entries()) {
    // One address each, so the rate limit stays out of the way.
    const res = await handle(...post(fields, { ip: `10.0.0.${i}` }));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'invalid' });
  }
  assert.equal(sent.length, 0);
});

test('a name cannot break the subject line', async () => {
  const { handle, sent } = setup();
  await handle(...post({ name: 'Ada\r\nBcc: x@example.com' }));
  assert.doesNotMatch(sent[0].subject, /[\r\n]/);
});

test('the fourth message from one address within ten minutes is limited', async () => {
  const { handle, sent } = setup();
  for (let i = 0; i < 3; i++) assert.equal((await handle(...post({}))).status, 200);
  const res = await handle(...post({}));
  assert.equal(res.status, 429);
  assert.equal(sent.length, 3);
  assert.equal((await handle(...post({}, { ip: '5.6.7.8' }))).status, 200);
});

test('missing configuration or a Resend failure reports an error', async () => {
  const unset = setup({ env: {} });
  assert.equal((await unset.handle(...post({}))).status, 500);
  assert.equal(unset.sent.length, 0);
  const failing = setup({ sendOk: false });
  const res = await failing.handle(...post({}));
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'failed' });
});

test('a form posted without JavaScript gets a page with a way back', async () => {
  const { handle } = setup();
  const res = await handle(...post({}, { json: false }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /href="\/"/);
});

test('only POST is accepted', async () => {
  const { handle } = setup();
  const res = await handle(new Request('https://doc-anonymizer.example/api/contact'), { ip: '1.2.3.4' });
  assert.equal(res.status, 405);
});

test('past the daily cap nobody gets through, until the next day', async () => {
  const { handle, sent, clock } = setup();
  for (let i = 0; i < 30; i++) assert.equal((await handle(...post({}, { ip: `10.1.0.${i}` }))).status, 200);
  const res = await handle(...post({}, { ip: '10.2.0.1' }));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'limited' });
  assert.equal(sent.length, 30);
  clock.t = 24 * 60 * 60_000;
  assert.equal((await handle(...post({}, { ip: '10.2.0.1' }))).status, 200);
});

test('invalid messages do not use up the daily cap', async () => {
  const { handle, sent } = setup();
  for (let i = 0; i < 40; i++) await handle(...post({ email: 'bad' }, { ip: `10.3.0.${i}` }));
  assert.equal((await handle(...post({}, { ip: '10.4.0.1' }))).status, 200);
  assert.equal(sent.length, 1);
});

test('when the store fails, nothing is sent', async () => {
  const broken = { get: async () => { throw new Error('down'); }, set: async () => {} };
  const { handle, sent } = setup({ store: broken });
  const res = await handle(...post({}));
  assert.equal(res.status, 500);
  assert.equal(sent.length, 0);
});
