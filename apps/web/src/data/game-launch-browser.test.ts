import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameLaunchErrorCode } from '@brand/contracts';
import { GameLaunchError, requestDemoLaunch, requestRealLaunch } from './game-launch-browser';

const launchUrl = 'https://platform.example/game/play/ticket-1';

function stubFetch(implementation: () => Promise<Response>) {
  const fetcher = vi.fn<typeof fetch>(implementation);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function expectLaunchError(promise: Promise<unknown>, code: GameLaunchErrorCode) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(GameLaunchError);
  expect((error as GameLaunchError).code).toBe(code);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestDemoLaunch', () => {
  it('posts to the same-origin BFF route and maps a valid demo launch', async () => {
    const fetcher = stubFetch(async () => Response.json({ launchUrl, mode: 'demo' }));
    const controller = new AbortController();

    await expect(requestDemoLaunch('406', controller.signal)).resolves.toEqual({
      launchUrl,
      mode: 'demo',
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/games/406/launch/demo');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', signal: controller.signal });
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual({ accept: 'application/json' });
  });

  it('encodes the game id into a single path segment', async () => {
    const fetcher = stubFetch(async () => Response.json({ launchUrl, mode: 'demo' }));

    await requestDemoLaunch('../a b/?x=1#y');

    expect(fetcher.mock.calls[0]![0]).toBe('/api/games/..%2Fa%20b%2F%3Fx%3D1%23y/launch/demo');
  });

  it.each([
    ['javascript:alert(1)'],
    ['http://platform.example/game/play/ticket'],
    ['data:text/html,hi'],
    ['/game/play/ticket'],
    ['not a url'],
    [42],
    [undefined],
  ])('rejects unsafe or malformed launch URL %s', async (value) => {
    stubFetch(async () => Response.json({ launchUrl: value, mode: 'demo' }));
    await expectLaunchError(requestDemoLaunch('406'), 'launch_unavailable');
  });

  it.each([[{ launchUrl, mode: 'real' }], [{ launchUrl }], [null], [[launchUrl]]])(
    'rejects an unexpected success shape %j',
    async (body) => {
      stubFetch(async () => Response.json(body));
      await expectLaunchError(requestDemoLaunch('406'), 'launch_unavailable');
    },
  );

  it('rejects a success response with a non-JSON body', async () => {
    stubFetch(async () => new Response('<html>', { status: 200 }));
    await expectLaunchError(requestDemoLaunch('406'), 'launch_unavailable');
  });

  it.each([
    [400, 'invalid_game_id'],
    [404, 'game_not_found'],
    [422, 'demo_unavailable'],
    [502, 'launch_unavailable'],
  ] as const)('maps BFF status %i to %s', async (status, code) => {
    stubFetch(async () => Response.json({ error: { code, message: 'safe message' } }, { status }));
    await expectLaunchError(requestDemoLaunch('406'), code);
  });

  it('falls back to launch_unavailable when the error body does not match the status', async () => {
    stubFetch(async () =>
      Response.json({ error: { code: 'game_not_found', message: 'x' } }, { status: 422 }),
    );
    await expectLaunchError(requestDemoLaunch('406'), 'launch_unavailable');
  });

  it.each([201, 401, 403, 500, 503, 504])(
    'maps unexpected status %i to launch_unavailable',
    async (status) => {
      stubFetch(async () =>
        Response.json({ error: { code: 'demo_unavailable', message: 'x' } }, { status }),
      );
      await expectLaunchError(requestDemoLaunch('406'), 'launch_unavailable');
    },
  );

  it('maps a network failure to launch_unavailable', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expectLaunchError(requestDemoLaunch('406'), 'launch_unavailable');
  });

  it('propagates aborts instead of mapping them', async () => {
    stubFetch(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    const error = await requestDemoLaunch('406', AbortSignal.abort()).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });
});

describe('requestRealLaunch', () => {
  it('posts with the same-origin session cookie and maps a valid real launch', async () => {
    const fetcher = stubFetch(async () => Response.json({ launchUrl, mode: 'real' }));

    await expect(requestRealLaunch('406')).resolves.toEqual({ launchUrl, mode: 'real' });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/games/406/launch/real');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    expect(init?.body).toBeUndefined();
  });

  it.each([
    [{ launchUrl, mode: 'demo' }],
    [{ launchUrl: 'http://platform.example/play', mode: 'real' }],
    [{ launchUrl: 'javascript:alert(1)', mode: 'real' }],
    [{ mode: 'real' }],
  ])('rejects an unexpected or unsafe success shape %j', async (body) => {
    stubFetch(async () => Response.json(body));
    await expectLaunchError(requestRealLaunch('406'), 'launch_unavailable');
  });

  it.each([
    [400, 'invalid_game_id'],
    [401, 'auth_required'],
    [403, 'game_unavailable'],
    [404, 'game_not_found'],
    [502, 'launch_unavailable'],
  ] as const)('maps BFF status %i to %s', async (status, code) => {
    stubFetch(async () => Response.json({ error: { code, message: 'safe' } }, { status }));
    await expectLaunchError(requestRealLaunch('406'), code);
  });

  it('maps account_restricted separately from game_unavailable', async () => {
    stubFetch(async () =>
      Response.json({ error: { code: 'account_restricted', message: 'restricted' } }, { status: 403 }),
    );
    await expectLaunchError(requestRealLaunch('406'), 'account_restricted');
  });

  it('treats any 401 as auth_required even without a matching body', async () => {
    stubFetch(async () => new Response('', { status: 401 }));
    await expectLaunchError(requestRealLaunch('406'), 'auth_required');
  });

  it.each([422, 500, 503])('maps unexpected status %i to launch_unavailable', async (status) => {
    stubFetch(async () =>
      Response.json({ error: { code: 'game_unavailable', message: 'x' } }, { status }),
    );
    await expectLaunchError(requestRealLaunch('406'), 'launch_unavailable');
  });

  it('maps a network failure to launch_unavailable', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expectLaunchError(requestRealLaunch('406'), 'launch_unavailable');
  });
});
