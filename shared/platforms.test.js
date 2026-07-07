import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlatformByHost,
  getSupportedMatchPatterns,
  normalizeHostname,
} from './platforms.js';

test('normalizeHostname strips a www prefix and lowercases hostnames', () => {
  assert.equal(normalizeHostname('WWW.ChatGPT.com'), 'chatgpt.com');
});

test('getPlatformByHost supports primary and legacy ChatGPT hosts', () => {
  assert.equal(getPlatformByHost('chatgpt.com')?.key, 'chatgpt');
  assert.equal(getPlatformByHost('chat.openai.com')?.key, 'chatgpt');
});

test('getPlatformByHost supports nested app subdomains', () => {
  assert.equal(getPlatformByHost('preview.claude.ai')?.key, 'claude');
});

test('getSupportedMatchPatterns includes all declared content script hosts', () => {
  assert.deepEqual(
    getSupportedMatchPatterns(),
    [
      'https://claude.ai/*',
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      'https://gemini.google.com/*',
      'https://chat.deepseek.com/*',
    ]
  );
});
