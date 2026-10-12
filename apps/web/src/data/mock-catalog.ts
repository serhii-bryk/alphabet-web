import type { Game, Lobby, SearchResult } from '@brand/contracts';

const game = (id: string, title: string, provider: string, kind: Game['kind'], category: string, art: number, status?: Game['status']): Game =>
  ({ id, title, provider, kind, category, art, status });

const games: Game[] = [
  game('orbit-run','Orbit Run','Northstar','casino','Slots',1,'hot'),
  game('paper-moon','Paper Moon','Kite Works','casino','Slots',2,'new'),
  game('highline','Highline','Studio Nine','casino','Table',3),
  game('signal-7','Signal Seven','Parade','casino','Jackpots',4,'hot'),
  game('verdant','Verdant Vault','Moss House','casino','Slots',5),
  game('arc-dealer','Arc Dealer','Live Foundry','live','Blackjack',6,'live'),
  game('night-table','Night Table','Live Foundry','live','Roulette',7,'live'),
  game('blue-room','Blue Room','Beacon','live','Game Shows',8,'live'),
  game('mono-baccarat','Mono Baccarat','Beacon','live','Baccarat',9,'live'),
  game('tiny-giants','Tiny Giants','Kite Works','casino','Originals',10,'new'),
  game('district','District Dice','Studio Nine','casino','Originals',11),
  game('solar-club','Solar Club','Northstar','casino','Slots',12,'new')
];

export async function getLobby(kind?: Game['kind']): Promise<Lobby> {
  const visible = kind ? games.filter((item) => item.kind === kind) : games;
  return {
    promotions: [
      { id: 'weekend', eyebrow: 'This weekend', title: 'Play in your own orbit', description: 'Fresh drops, compact and ready.', tone: 'cobalt' },
      { id: 'live', eyebrow: 'Live tables', title: 'The room is open', description: 'Find a seat in seconds.', tone: 'coral' },
      { id: 'new', eyebrow: 'Just landed', title: 'Three new worlds', description: 'Small games with bright ideas.', tone: 'mint' }
    ],
    categories: ['For You','Slots','Live','Originals','Table','Jackpots','Game Shows','Blackjack'],
    sections: [
      { id: 'popular', title: 'Popular', games: visible.slice(0, 8) },
      { id: 'trending', title: 'Trending now', games: [...visible].reverse().slice(0, 8) },
      { id: 'new', title: 'New games', games: visible.filter((item) => item.status === 'new').concat(visible.slice(0, 4)) },
      { id: 'live', title: 'Live Casino', games: games.filter((item) => item.kind === 'live') }
    ],
    providers: ['Northstar','Kite Works','Studio Nine','Live Foundry','Beacon','Parade','Moss House']
  };
}

export async function search(query: string): Promise<SearchResult> {
  const normalized = query.trim().toLowerCase();
  const found = normalized ? games.filter((item) => [item.title,item.provider,item.category].some((value) => value.toLowerCase().includes(normalized))) : games;
  return { query, games: found };
}
