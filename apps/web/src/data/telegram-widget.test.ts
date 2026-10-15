// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { openTelegramLogin } from './telegram-widget';

afterEach(() => {
  document.head.innerHTML = '';
  delete window.Telegram;
});

describe('openTelegramLogin', () => {
  it('returns the verified widget user', async () => {
    window.Telegram = {
      Login: {
        auth(options, callback) {
          expect(options).toEqual({ bot_id: '123456789' });
          callback({
            id: 900000001,
            first_name: 'Telegram',
            auth_date: 1_700_000_000,
            hash: 'ab'.repeat(32),
          });
        },
      },
    };

    await expect(openTelegramLogin('123456789')).resolves.toMatchObject({
      id: 900000001,
      first_name: 'Telegram',
    });
  });

  it('treats a closed Telegram window as cancellation', async () => {
    window.Telegram = {
      Login: {
        auth(_options, callback) {
          callback(false);
        },
      },
    };

    await expect(openTelegramLogin('123456789')).resolves.toBeNull();
  });
});
