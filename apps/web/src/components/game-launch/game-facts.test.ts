import type { CatalogGame } from '@brand/contracts';
import { describe, expect, it } from 'vitest';
import { formatListedAt, gameFacts } from './game-facts';

const game: CatalogGame = {
  id: '42',
  slug: 'live-table',
  title: 'Live Table',
  kind: 'live',
  imageUrl: 'https://cdn.example/live.png',
  provider: {
    id: '7',
    code: 'studio',
    name: 'Studio',
    displayName: 'Studio Games',
    groupedCode: null,
  },
  categories: [
    { id: '4', slug: 'tables', name: 'Table Games', parentId: null },
  ],
  demoPlayEnabled: false,
  active: true,
  rtp: '97',
  volatility: 'medium',
  gameType: 'table',
  listedAt: '2024-05-01T00:00:00.000Z',
};

describe('gameFacts', () => {
  it('shows confirmed metadata for the active game', () => {
    expect(gameFacts(game).map((fact) => fact.id)).toEqual([
      'provider',
      'categories',
      'format',
      'gameType',
      'rtp',
      'volatility',
      'demo',
      'real',
      'listed',
    ]);
    expect(gameFacts(game).find((fact) => fact.id === 'rtp')?.value).toBe('97');
  });

  it('omits missing metadata and never invents a description', () => {
    const sparse: CatalogGame = {
      ...game,
      provider: null,
      categories: [],
      rtp: null,
      volatility: null,
      gameType: null,
      listedAt: null,
      active: undefined,
    };
    const ids = gameFacts(sparse).map((fact) => fact.id);
    expect(ids).toEqual(['format', 'demo']);
    expect(ids).not.toContain('rtp');
    expect(ids).not.toContain('description');
    expect(formatListedAt('not-a-date', 'en')).toBeNull();
    expect(formatListedAt('2024-05-01T00:00:00.000Z', 'en')).toBeTruthy();
  });
});
