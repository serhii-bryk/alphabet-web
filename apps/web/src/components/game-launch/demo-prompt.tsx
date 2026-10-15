'use client';

import type { DemoPromptLevel } from './demo-play';
import { useTranslations } from 'next-intl';
import { GuestAcquisition } from '../auth/guest-acquisition';
import { Button } from '../ui';


export function DemoPrompt({
  level,
  className = 'absolute inset-x-3 bottom-3 z-30',
  onDismiss,
  onRegister,
  onSignIn,
}: {
  level: DemoPromptLevel;
  className?: string;
  onDismiss: (level: Exclude<DemoPromptLevel, 'none'>) => void;
  onRegister: (opener: HTMLElement) => void;
  onSignIn: (opener: HTMLElement) => void;
}) {
  const t = useTranslations('workspace');
  if (level === 'none') return null;
  const strong = level === 'strong';
  return (
    <div className={`pointer-events-none flex justify-center ${className}`}>
      <div
        data-demo-prompt={level}
        className={`pointer-events-auto w-full max-w-md rounded-[var(--radius-md)] border bg-[var(--surface)] shadow-lg ${
          strong ? 'border-[var(--accent)] p-5' : 'border-[var(--line)] p-3'
        }`}
      >
        <p className={strong ? 'text-base font-black' : 'text-sm font-bold'}>
          {strong ? t('strongTitle') : t('softTitle')}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">{strong ? t('strongBody') : t('softBody')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <GuestAcquisition>
            <Button type="button" onClick={(event) => onRegister(event.currentTarget)}>
              {t('register')}
            </Button>
          </GuestAcquisition>
          <Button type="button" variant="secondary" onClick={(event) => onSignIn(event.currentTarget)}>
            {t('signIn')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => onDismiss(level)}>
            {t('later')}
          </Button>
        </div>
      </div>
    </div>
  );
}
