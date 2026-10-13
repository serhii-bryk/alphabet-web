'use client';

import { useId } from 'react';
import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { startRouteProgress } from './route-progress';

type AppLocale = 'en' | 'ar';
const locales = [
  { id: 'en', code: 'EN', english: 'English' },
  { id: 'ar', code: 'AR', english: 'Arabic' },
] as const;

export function LocaleSwitcher({ showLabel = false }: { showLabel?: boolean }) {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('localeSwitcher');
  const labelId = useId();

  const choose = (next: AppLocale) => {
    if (next === locale) return;
    startRouteProgress();
    router.replace(`${pathname}${window.location.search}`, { locale: next });
  };

  if (!showLabel) {
    const next = locale === 'en' ? 'ar' : 'en';
    const current = locales.find((option) => option.id === locale) ?? locales[0];
    return (
      <button
        type="button"
        aria-label={`${t('label')}: ${current.english}. Switch to ${locales.find((option) => option.id === next)?.english}`}
        title={`${t('label')} · ${current.english}`}
        onClick={() => choose(next)}
        className="locale-compact pressable relative grid size-11 place-items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]"
      >
        <Globe size={18} aria-hidden />
        <span aria-hidden className="locale-compact-code">{current.code}</span>
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-1.5">
      <span id={labelId} className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]">
        <Globe size={14} aria-hidden className="text-[var(--accent)]" />
        {t('label')}
        {locale !== 'en' && <span aria-hidden lang="en" className="text-[10px] font-semibold opacity-70" dir="ltr">· Language</span>}
      </span>
      <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-1">
        {locales.map((option) => {
          const active = option.id === locale;
          return (
            <button
              key={option.id}
              type="button"
              lang={option.id}
              aria-pressed={active}
              aria-label={option.id === 'ar' ? `${t('ar')} (Arabic)` : t('en')}
              onClick={() => choose(option.id)}
              className="locale-option flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-sm font-bold"
            >
              <span aria-hidden className="locale-code" dir="ltr">{option.code}</span>
              <span className="truncate">{t(option.id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
