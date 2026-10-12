'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { IconButton } from '../ui';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AuthDialog({
  title,
  description,
  onClose,
  children,
  panelClassName = '',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const t = useTranslations('shell');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input, button:not([disabled])')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;
      event.preventDefault();
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next = current < 0 ? (event.shiftKey ? focusable.length - 1 : 0) : current + step;
      focusable[(next + focusable.length) % focusable.length]?.focus();
    };
    addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div data-overlay="modal" className="fixed inset-0 z-[95] grid place-items-end sm:place-items-center">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('closeDialog')}
        className="absolute inset-0 bg-black/55"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`surface relative max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-[var(--radius-lg)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[var(--radius-lg)] sm:pb-5 ${panelClassName}`}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-xl font-black">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-[var(--muted)]">
                {description}
              </p>
            )}
          </div>
          <IconButton label={t('close')} type="button" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
