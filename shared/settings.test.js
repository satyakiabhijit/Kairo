import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings.js';

test('normalizeSettings keeps defaults when settings are missing', () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
});

test('normalizeSettings trims API keys before persistence', () => {
  assert.deepEqual(
    normalizeSettings({ apiKey: '  sk-ant-example  ', autoEnrich: true }),
    {
      apiKey: 'sk-ant-example',
      autoEnrich: true,
      showFloatingButton: true,
    }
  );
});

test('normalizeSettings coerces booleans and drops unknown fields', () => {
  assert.deepEqual(
    normalizeSettings({
      apiKey: 123,
      autoEnrich: 'yes',
      showFloatingButton: false,
      extra: 'ignored',
    }),
    {
      apiKey: '',
      autoEnrich: false,
      showFloatingButton: false,
    }
  );
});
