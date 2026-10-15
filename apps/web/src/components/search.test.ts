import { describe, expect, it } from 'vitest';
import { getNextFocusIndex } from './search-index';

describe('getNextFocusIndex', () => {
  it('cycles forward and backward with wraparound', () => {
    expect(getNextFocusIndex(2, 0, false)).toBe(1);
    expect(getNextFocusIndex(2, 1, false)).toBe(0);
    expect(getNextFocusIndex(2, 1, true)).toBe(0);
    expect(getNextFocusIndex(2, 0, true)).toBe(1);
  });

  it('handles missing focus and empty dialogs safely', () => {
    expect(getNextFocusIndex(2, -1, false)).toBe(0);
    expect(getNextFocusIndex(2, -1, true)).toBe(1);
    expect(getNextFocusIndex(0, -1, false)).toBe(-1);
  });
});
