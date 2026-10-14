'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AuthRequestError, fetchAuthProviders, loginWithTelegram } from '@/data/auth-browser';
import { openTelegramLogin } from '@/data/telegram-widget';
import { AlphaBetLoader } from '../alphabet-loader';
import { Button } from '../ui';
import { applyAuthenticatedSession } from './session';

type TelegramNotice = 'cancelled' | 'external_auth_rejected' | 'external_auth_unavailable' | 'account_restricted';

export function TelegramContinue({
  onAuthenticated,
  emailDivider = true,
}: {
  onAuthenticated?: () => void;
  emailDivider?: boolean;
}) {
  const t = useTranslations('auth');
  const client = useQueryClient();
  const [botId, setBotId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<TelegramNotice | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAuthProviders(controller.signal)
      .then((providers) => {
        if (!controller.signal.aborted) setBotId(providers.telegram?.botId ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!botId) return null;

  const start = () => {
    if (pending) return;
    setNotice(null);
    setPending(true);
    void openTelegramLogin(botId)
      .then(async (user) => {
        if (!user) {
          setNotice('cancelled');
          return;
        }
        const session = await loginWithTelegram(user);
        applyAuthenticatedSession(client, session);
        onAuthenticated?.();
      })
      .catch((error: unknown) => {
        setNotice(
          error instanceof AuthRequestError &&
            (error.code === 'external_auth_rejected' ||
              error.code === 'external_auth_unavailable' ||
              error.code === 'account_restricted')
            ? error.code
            : 'external_auth_unavailable',
        );
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <div className="mb-4">
      <Button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        className="h-11 w-full"
        onClick={start}
      >
        {pending && <AlphaBetLoader size="sm" className="text-current" />}
        {pending ? t('signingIn') : t('continueTelegram')}
      </Button>
      {notice && (
        <p role="alert" className="mt-2 text-sm font-semibold text-[var(--danger)]">
          {notice === 'cancelled' ? t('telegramCancelled') : t(`loginErrors.${notice}`)}
        </p>
      )}
      {emailDivider && (
        <div className="mt-4 flex items-center gap-3 text-xs text-[var(--muted)] before:h-px before:flex-1 before:bg-[var(--line)] after:h-px after:flex-1 after:bg-[var(--line)]">
          {t('orEmail')}
        </div>
      )}
    </div>
  );
}
