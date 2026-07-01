import { describe, it, expect } from 'vitest';
import { truncate, platformName } from './utils.js';

describe('Utils', () => {
  it('truncates text properly', () => {
    expect(truncate('Hello World', 5)).toBe('Hello…');
    expect(truncate('Short', 10)).toBe('Short');
    expect(truncate('', 5)).toBe('');
  });

  it('returns correct platform names', () => {
    expect(platformName('claude')).toBe('Claude');
    expect(platformName('unknown')).toBe('unknown');
  });
});
