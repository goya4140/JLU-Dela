import { describe, expect, it } from 'vitest';
import { todoCompleted } from './todo';

describe('todo completion', () => {
  it('keeps unknown and offline statuses separate from completed work', () => {
    expect(todoCompleted('unknown')).toBe(false);
    expect(todoCompleted('offline')).toBe(false);
    expect(todoCompleted('pending')).toBe(false);
    expect(todoCompleted('completed')).toBe(true);
  });
});
