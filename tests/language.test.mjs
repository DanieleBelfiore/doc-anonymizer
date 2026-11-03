// The home page follows the browser language (netlify/edge-functions/language.mjs):
// a mistake here sends Italian visitors to /en/, or locks crawlers out of the Italian page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import language from '../netlify/edge-functions/language.mjs';

const SITE = 'https://doc-anonymizer.danielebelfiore.dev/';
const visit = (headers = {}, { url = SITE, method = 'GET' } = {}) => language(new Request(url, { method, headers }));
const location = res => res?.headers.get('location');

test('an Italian browser stays on the Italian page', () => {
  assert.equal(visit({ 'accept-language': 'it-IT,it;q=0.9,en;q=0.8' }), undefined);
});

test('an English browser goes to /en/', () => {
  const res = visit({ 'accept-language': 'en-US,en;q=0.9' });
  assert.equal(res.status, 302);
  assert.equal(location(res), `${SITE}en/`);
});

test('an unsupported language falls back to English', () => {
  assert.equal(location(visit({ 'accept-language': 'fr-FR,fr;q=0.9' })), `${SITE}en/`);
});

test('the first supported language wins, by q weight', () => {
  assert.equal(visit({ 'accept-language': 'fr,it;q=0.8,en;q=0.5' }), undefined);
  assert.equal(visit({ 'accept-language': 'en;q=0.5,it;q=0.9' }), undefined);
  assert.equal(location(visit({ 'accept-language': 'it;q=0.4,en' })), `${SITE}en/`);
});

test('a request with no language (crawler) gets the x-default Italian page', () => {
  assert.equal(visit(), undefined);
  assert.equal(visit({ 'accept-language': '' }), undefined);
});

test('a click on the language switch is respected', () => {
  assert.equal(visit({ 'accept-language': 'en-US', referer: `${SITE}en/` }), undefined);
});

test('a visitor from another site still gets the browser language', () => {
  assert.equal(location(visit({ 'accept-language': 'en-US', referer: 'https://www.google.com/' })), `${SITE}en/`);
});

test('the query string survives the redirect', () => {
  assert.equal(location(visit({ 'accept-language': 'en' }, { url: `${SITE}?utm_source=x` })), `${SITE}en/?utm_source=x`);
});

test('only page loads are redirected', () => {
  assert.equal(visit({ 'accept-language': 'en' }, { method: 'POST' }), undefined);
});
