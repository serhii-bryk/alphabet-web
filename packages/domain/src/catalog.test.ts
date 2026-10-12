import type { PlatformGame } from '@brand/platform';
import { describe, expect, it } from 'vitest';
import { mapGame } from './index.js';

const game: PlatformGame = {
  id: 42,
  provider_id: 7,
  provider_name: 'Studio',
  provider_category_id: 4,
  provider_game_id: 'studio-42',
  name: 'Live Table',
  slug: 'live-table',
  type: 'live-casino',
  provider_game_type: ' table ',
  icon: 'https://cdn.example/live-table.png',
  rtp: 97,
  volatility: 'medium',
  is_active: 1,
  demo_play_enabled: 0,
  created_at: '2024-05-01T00:00:00.000Z',
  updated_at: '2024-06-01T00:00:00.000Z',
  provider: {
    id: 7,
    code: 'studio',
    name: 'Studio',
    display_name: 'Studio Games',
    grouped_code: null,
  },
  categories: [
    { id: 4, slug: 'tables', full_slug: 'live/tables', name: 'Table Games', parent_id: null },
  ],
};

describe('mapGame', () => {
  it('maps confirmed Platform metadata and drops the provider game id', () => {
    const mapped = mapGame(game);

    expect(mapped).toMatchObject({
      id: '42',
      title: 'Live Table',
      kind: 'live',
      demoPlayEnabled: false,
      active: true,
      rtp: '97',
      volatility: 'medium',
      gameType: 'table',
      listedAt: '2024-05-01T00:00:00.000Z',
    });
    expect(mapped).not.toHaveProperty('provider_game_id');
    expect(mapped).not.toHaveProperty('providerGameId');
    expect(JSON.stringify(mapped)).not.toContain('studio-42');
  });

  it('omits empty metrics instead of inventing them', () => {
    expect(
      mapGame({
        ...game,
        type: 'slots',
        rtp: null,
        volatility: '  ',
        provider_game_type: null,
        created_at: null,
        demo_play_enabled: 1,
        is_active: 0,
      }),
    ).toMatchObject({
      kind: 'casino',
      demoPlayEnabled: true,
      active: false,
      rtp: null,
      volatility: null,
      gameType: null,
      listedAt: null,
    });
  });
});
