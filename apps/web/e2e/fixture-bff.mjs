import { createServer } from 'node:http';

const testProvider = {
  id: 'test-provider',
  code: 'test-provider',
  name: 'Test Provider',
  displayName: 'Test Provider',
  groupedCode: null,
};

const evolution = {
  id: 'evolution',
  code: 'evolution',
  name: 'Evolution',
  displayName: 'Evolution',
  groupedCode: null,
};

const slotsCategory = { id: 'slots', slug: 'slots', name: 'Slots', parentId: null };
const liveCategory = { id: 'live', slug: 'live', name: 'Live', parentId: null };

function game(fields) {
  return {
    slug: fields.id,
    imageUrl: null,
    categories: [],
    ...fields,
  };
}

const slots = [
  game({
    id: '101',
    title: 'Book of Tests',
    kind: 'casino',
    provider: testProvider,
    demoPlayEnabled: true,
  }),
  game({
    id: '102',
    title: 'Second Test',
    kind: 'casino',
    provider: testProvider,
    demoPlayEnabled: true,
  }),
];

const live = [
  game({
    id: '202',
    title: 'Test Blackjack',
    kind: 'live',
    provider: evolution,
    demoPlayEnabled: false,
  }),
];

function lobby(games, providers, category) {
  return {
    promotions: [],
    categories: [category],
    sections: [{ id: 'games', title: 'Games', games }],
    providers,
    pagination: {
      page: 1,
      perPage: 24,
      total: games.length,
      lastPage: 1,
      from: 1,
      to: games.length,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

const createdSession = {
  authenticated: true,
  playerId: '42',
  email: 'mobile@example.com',
  currency: 'EUR',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

let signedIn = false;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4010');
  if (request.method === 'GET' && url.pathname === '/session') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(signedIn ? createdSession : { authenticated: false }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/account/balance') {
    response.writeHead(signedIn ? 200 : 401, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        signedIn
          ? { balance: 0, currency: 'EUR' }
          : { error: { code: 'session_ended', message: 'Your session has ended' } },
      ),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/account/profile') {
    response.writeHead(signedIn ? 200 : 401, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        signedIn
          ? {
              playerId: '42',
              email: 'mobile@example.com',
              firstName: 'Mobile',
              lastName: 'Player',
              currency: 'EUR',
              countryCode: 'GB',
              emailVerified: false,
            }
          : { error: { code: 'session_ended', message: 'Your session has ended' } },
      ),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/registration/options') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        countries: [
          { code: 'GB', name: 'United Kingdom', callingCode: '44' },
          { code: 'DE', name: 'Germany', callingCode: '49' },
        ],
        currencies: [
          { code: 'EUR', name: 'Euro', symbol: '€' },
          { code: 'GBP', name: 'Pound Sterling', symbol: '£' },
        ],
        defaults: { country: 'GB', currency: 'EUR' },
      }),
    );
    return;
  }
  if (request.method === 'POST' && url.pathname === '/registration') {
    signedIn = true;
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'created', session: createdSession }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/catalog/lobby') {
    const liveCasino = url.searchParams.get('type') === 'live-casino';
    const body = liveCasino
      ? lobby(live, [evolution], liveCategory)
      : lobby(slots, [testProvider], slotsCategory);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(4010, '127.0.0.1');
