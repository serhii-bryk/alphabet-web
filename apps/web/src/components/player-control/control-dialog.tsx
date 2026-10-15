'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { IconButton } from '../ui';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ControlDialog({
  title,
  description,
  children,
  onClose,
  dismissible = true,
  testId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose?: () => void;
  dismissible?: boolean;
  testId?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const t = useTranslations('shell');

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
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
  }, [dismissible]);

  return (
    <div data-overlay="modal" className="fixed inset-0 z-[100] grid place-items-end sm:place-items-center">
      {dismissible && onClose ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('closeDialog')}
          className="modal-backdrop absolute inset-0 bg-black/55"
          onClick={onClose}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        className="surface panel modal-panel relative max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-[var(--radius-lg)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[var(--radius-lg)] sm:pb-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-xl font-black text-start">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-2 text-start text-sm leading-relaxed text-[var(--muted)]">
                {description}
              </p>
            )}
          </div>
          {dismissible && onClose && (
            <IconButton label={t('close')} type="button" onClick={onClose}>
              <X size={18} />
            </IconButton>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
