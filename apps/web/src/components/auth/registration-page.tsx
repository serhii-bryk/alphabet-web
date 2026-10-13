'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Skeleton } from '../ui';
import { useAuthDialog } from './auth-provider';
import { RegistrationDialog } from './registration-dialog';
import { useSession } from './session';

export function RegistrationPage() {
  const { openLogin } = useAuthDialog();
  const { status } = useSession();
  const router = useRouter();
  const t = useTranslations('shell');

  useEffect(() => {
    if (status === 'authenticated') router.replace('/casino');
  }, [router, status]);

  if (status !== 'guest') {
    return (
      <div className="mx-auto max-w-md py-16" aria-busy={status === 'pending' || undefined}>
        <p role="status" className="sr-only">
          {t('loadingAccount')}
        </p>
        <Skeleton className="h-96 motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <RegistrationDialog
      open
      presentation="page"
      onClose={() => router.push('/casino')}
      onSignIn={() => openLogin()}
    />
  );
}
