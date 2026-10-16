'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import {
  ExternalAuthRequestError,
  fetchExternalAuthMethods,
  startExternalAuth,
  type ExternalAuthMethod,
} from '@/data/external-auth-browser';
import { AlphaBetLoader } from '../alphabet-loader';
import { Button } from '../ui';

export function ExternalAuthButtons({ emailDivider = true }: { emailDivider?: boolean }) {
  const t = useTranslations('auth');
  const pathname = usePathname();
  const [methods, setMethods] = useState<ExternalAuthMethod[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchExternalAuthMethods(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setMethods(next);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (methods.length === 0) return null;

  const start = (method: ExternalAuthMethod) => {
    if (pending) return;
    setNotice(null);
    setPending(method.code);
    void startExternalAuth(method.code, pathname || '/casino')
      .then((redirectUrl) => {
        window.location.assign(redirectUrl);
      })
      .catch((error: unknown) => {
        const code = error instanceof ExternalAuthRequestError ? error.code : 'external_auth_unavailable';
        setNotice(t(`loginErrors.${code}`));
        setPending(null);
      });
  };

  return (
    <div className="mb-4 flex flex-col gap-2">
      {methods.map((method) => (
        <Button
          key={method.code}
          type="button"
          variant="secondary"
          disabled={pending !== null}
          aria-busy={pending === method.code || undefined}
          className="h-11 w-full bg-[color-mix(in_srgb,var(--surface-2)_82%,transparent)]"
          onClick={() => start(method)}
        >
          {pending === method.code ? (
            <AlphaBetLoader size="sm" className="text-current" />
          ) : (
            <ProviderIcon code={method.code} />
          )}
          {pending === method.code ? t('signingIn') : t('continueWith', { name: method.name })}
        </Button>
      ))}
      {notice && (
        <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
          {notice}
        </p>
      )}
      {emailDivider && (
        <div className="mt-2 flex items-center gap-3 text-xs text-[var(--muted)] before:h-px before:flex-1 before:bg-[var(--line)] after:h-px after:flex-1 after:bg-[var(--line)]">
          {t('orEmail')}
        </div>
      )}
    </div>
  );
}

function ProviderIcon({ code }: { code: string }) {
  if (code === 'telegram') {
    return (
      <svg
        data-provider-icon="telegram"
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5 shrink-0"
      >
        <circle cx="12" cy="12" r="12" fill="#229ED9" />
        <path
          fill="#fff"
          d="m18.8 6.7-2.2 10.4c-.2.7-.6.9-1.2.6l-3.3-2.4-1.6 1.5c-.2.2-.3.3-.7.3l.2-3.4 6.2-5.6c.3-.2-.1-.4-.4-.2l-7.7 4.8-3.3-1c-.7-.2-.7-.7.2-1.1l12.9-5c.6-.2 1.1.1.9 1.1Z"
        />
      </svg>
    );
  }
  if (code === 'google') {
    return (
      <span
        data-provider-icon="google"
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-[#4285F4]"
      >
        G
      </span>
    );
  }
  return null;
}
