import { AuthRequestError, type TelegramWidgetUser } from './auth-browser';

const widgetSrc = 'https://telegram.org/js/telegram-widget.js?22';

interface TelegramLoginApi {
  auth: (
    options: { bot_id: string },
    callback: (user: TelegramWidgetUser | false) => void,
  ) => void;
}

declare global {
  interface Window {
    Telegram?: { Login?: TelegramLoginApi };
  }
}

let loading: Promise<void> | undefined;

function ensureTelegramWidget(): Promise<void> {
  if (window.Telegram?.Login?.auth) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = widgetSrc;
    script.async = true;
    script.onload = () => {
      if (window.Telegram?.Login?.auth) {
        resolve();
        return;
      }
      loading = undefined;
      reject(new AuthRequestError('external_auth_unavailable'));
    };
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new AuthRequestError('external_auth_unavailable'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function openTelegramLogin(botId: string): Promise<TelegramWidgetUser | null> {
  return ensureTelegramWidget().then(
    () =>
      new Promise((resolve, reject) => {
        const auth = window.Telegram?.Login?.auth;
        if (!auth) {
          reject(new AuthRequestError('external_auth_unavailable'));
          return;
        }
        auth({ bot_id: botId }, (user) => {
          resolve(user ? user : null);
        });
      }),
  );
}
