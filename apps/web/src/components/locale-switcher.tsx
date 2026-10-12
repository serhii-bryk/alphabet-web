'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleSwitcher({ showLabel = false }: { showLabel?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('localeSwitcher');
  const labelId = useId();

  return (
    <div className="grid gap-1">
      <label id={labelId} htmlFor={`${labelId}-select`} className={showLabel ? 'text-xs font-bold' : 'sr-only'}>
        {t('label')}
      </label>
      <select
        id={`${labelId}-select`}
        value={locale}
        aria-labelledby={labelId}
        onChange={(event) => {
          const next = event.target.value;
          if ((next !== 'en' && next !== 'ar') || next === locale) return;
          const query = window.location.search;
          router.replace(`${pathname}${query}`, { locale: next });
        }}
        className="h-11 min-h-11 w-full max-w-[9.5rem] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-2 text-sm font-bold text-[var(--text)] lg:h-10 lg:min-h-10"
      >
        <option value="en">{t('en')}</option>
        <option value="ar">{t('ar')}</option>
      </select>
    </div>
  );
}
