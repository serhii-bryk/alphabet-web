'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAuthDialog } from './auth-provider';
import { RegistrationDialog } from './registration-dialog';
import { useSession } from './session';

export function RegistrationPage() {
  const { openLogin } = useAuthDialog();
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/casino');
  }, [router, status]);

  return (
    <RegistrationDialog
      open
      presentation="page"
      onClose={() => router.push('/casino')}
      onSignIn={() => openLogin()}
    />
  );
}
