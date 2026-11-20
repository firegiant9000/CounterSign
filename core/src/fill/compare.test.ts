import { describe, expect, it } from 'vitest';
import { sameLink, samePhone, sameProfileValue, sameText } from './compare';

describe('sameText', () => {
  it('ignores surrounding spaces and case', () => {
    expect(sameText(' Sam ', 'sam')).toBe(true);
  });

  it('treats different words as different', () => {
    expect(sameText('Sam', 'Samuel')).toBe(false);
  });
});

describe('samePhone', () => {
  it.each([
    ['+1 (555) 010-0142', '555 010 0142', true],
    ['555-010-0142', '5550100142', true],
    ['555-010-0142', '555-010-0143', false],
    ['0142', '10142', false],
    ['5550100142', '99995550100142', false],
    ['', '', false],
    ['abc', 'def', false],
  ])('samePhone(%j, %j) is %s', (a, b, expected) => {
    expect(samePhone(a, b)).toBe(expected);
  });
});

describe('sameLink', () => {
  it.each([
    ['https://www.example.com/in/sam/', 'example.com/in/sam', true],
    ['HTTP://Example.com', 'example.com', true],
    ['example.com/a', 'example.com/b', false],
    ['https://example.com//', 'example.com', true],
  ])('sameLink(%j, %j) is %s', (a, b, expected) => {
    expect(sameLink(a, b)).toBe(expected);
  });
});

describe('sameProfileValue', () => {
  it.each([
    ['phone', '+1 555 010 0142', '5550100142', true],
    ['website', 'https://example.com/', 'example.com', true],
    ['city', 'Springfield ', 'springfield', true],
    ['email', 'a@example.com', 'b@example.com', false],
  ] as const)(
    'sameProfileValue(%j, %j, %j) is %s',
    (key, formValue, own, expected) => {
      expect(sameProfileValue(key, formValue, own)).toBe(expected);
    },
  );
});
