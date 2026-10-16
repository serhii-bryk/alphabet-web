'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  ExternalAuthRequestError,
  finishExternalAuth,
} from '@/data/external-auth-browser';
import type { LoginErrorCode } from '@/data/auth-browser';
import { AlphaBetLoader } from '../alphabet-loader';
import { Button } from '../ui';
import { applyAuthenticatedSession } from './session';

let capturedQuery: URLSearchParams | undefined;
const submitted = new Set<string>();

function takeCallbackQuery(): URLSearchParams {
  const current = new URLSearchParams(window.location.search);
  if (current.has('ticket') || current.has('error') || current.has('client_state')) {
    capturedQuery = current;
    const next = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', next);
    return current;
  }
  return capturedQuery ?? current;
}

export function AuthCallback() {
  const t = useTranslations('auth');
  const router = useRouter();
  const client = useQueryClient();
  const [error, setError] = useState<LoginErrorCode | null>(null);

  useEffect(() => {
    const query = takeCallbackQuery();
    const ticket = query.get('ticket') ?? undefined;
    const clientState = query.get('client_state') ?? undefined;
    const callbackError = query.get('error') ?? undefined;
    const key = `${ticket ?? ''}|${clientState ?? ''}|${callbackError ?? ''}`;
    if (submitted.has(key)) return;
    submitted.add(key);
    void finishExternalAuth({
      ...(ticket ? { ticket } : {}),
      ...(clientState ? { clientState } : {}),
      ...(callbackError ? { error: callbackError } : {}),
    })
      .then((result) => {
        if (result.status === 'onboarding_required') {
          router.replace('/auth/onboarding');
          return;
        }
        applyAuthenticatedSession(client, result.session);
        router.replace(result.next || '/casino');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ExternalAuthRequestError ? caught.code : 'external_auth_unavailable');
      });
  }, [client, router]);

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      {error ? (
        <>
          <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
            {t(`loginErrors.${error}`)}
          </p>
          <Button type="button" className="h-11" onClick={() => router.replace('/casino')}>
            {t('backHome')}
          </Button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
          <AlphaBetLoader size="sm" />
          {t('callbackWorking')}
        </p>
      )}
    </div>
  );
}
