'use client';

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Fullscreen, Minimize } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ToolButton({
  label,
  tip = label,
  onClick,
  children,
  pressed,
  disabled,
  className = '',
  ...data
}: {
  label: string;
  tip?: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`game-tool ${className}`}
      {...data}
    >
      {children}
      <span aria-hidden className="game-tool-tip">{tip}</span>
    </button>
  );
}

export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Fullscreen support is only knowable in the browser; the server render hides the control.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof document !== 'undefined' && document.fullscreenEnabled === true);
    const sync = () => setActive(Boolean(target.current) && document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [target]);

  const toggle = useCallback(async () => {
    const element = target.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else await element.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      setActive(document.fullscreenElement === element);
    }
  }, [target]);

  return { supported, active, toggle };
}

export function FullscreenButton({ target, title }: { target: RefObject<HTMLElement | null>; title: string }) {
  const t = useTranslations('workspace');
  const { supported, active, toggle } = useFullscreen(target);
  if (!supported) return null;
  return (
    <ToolButton
      label={active ? t('exitFullscreenTitle', { title }) : t('fullscreenTitle', { title })}
      tip={active ? t('exitFullscreen') : t('fullscreen')}
      pressed={active}
      onClick={() => void toggle()}
      data-fullscreen=""
    >
      {active ? <Minimize aria-hidden size={17} /> : <Fullscreen aria-hidden size={17} />}
    </ToolButton>
  );
}
