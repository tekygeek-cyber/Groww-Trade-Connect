import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Firebase client config is checked in without a key', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
  assert.equal(config.apiKey, '');
  assert.ok(config.projectId);
});

test('optional Google Sheets authentication uses build-time config and fails closed', () => {
  const source = readFileSync(new URL('../src/lib/google-sheets.ts', import.meta.url), 'utf8');
  assert.match(source, /import\.meta\.env\.VITE_FIREBASE_API_KEY/);
  assert.match(source, /if \(!auth\)/);
  assert.doesNotMatch(source, /AIza[A-Za-z0-9_-]{25,}/);
});
