'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { GuestAcquisition } from './auth/guest-acquisition';
import { DepositButton } from './cashier/cashier-provider';

const joinClass =
  'inline-flex h-11 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-contrast)]';

export function PromotionsCta() {
  const t = useTranslations('pages');
  return (
    <div className="mt-6">
      <GuestAcquisition replacement={<DepositButton appearance="header" />}>
        <Link href="/register" className={joinClass}>
          {t('joinNow')}
        </Link>
      </GuestAcquisition>
    </div>
  );
}
