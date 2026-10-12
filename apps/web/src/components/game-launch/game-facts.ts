import type { CatalogGame } from '@brand/contracts';

export type GameFactId =
  | 'provider'
  | 'categories'
  | 'format'
  | 'gameType'
  | 'rtp'
  | 'volatility'
  | 'demo'
  | 'real'
  | 'listed';

export interface GameFact {
  id: GameFactId;
  value: string;
}

export function formatListedAt(value: string, locale: string): string | null {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(time);
}

export function gameFacts(game: CatalogGame): GameFact[] {
  const facts: GameFact[] = [];
  const provider = game.provider?.displayName || game.provider?.name;
  if (provider) facts.push({ id: 'provider', value: provider });
  const categories = game.categories.map((category) => category.name).filter((name) => name.trim());
  if (categories.length > 0) facts.push({ id: 'categories', value: categories.join(', ') });
  facts.push({ id: 'format', value: game.kind });
  if (game.gameType?.trim()) facts.push({ id: 'gameType', value: game.gameType.trim() });
  if (game.rtp?.trim()) facts.push({ id: 'rtp', value: game.rtp.trim() });
  if (game.volatility?.trim()) facts.push({ id: 'volatility', value: game.volatility.trim() });
  facts.push({ id: 'demo', value: game.demoPlayEnabled ? 'available' : 'unavailable' });
  if (typeof game.active === 'boolean') {
    facts.push({ id: 'real', value: game.active ? 'available' : 'unavailable' });
  }
  if (game.listedAt?.trim()) facts.push({ id: 'listed', value: game.listedAt.trim() });
  return facts;
}
