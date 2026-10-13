'use client';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Button({ className='', variant='primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary' }) {
  return <button className={`btn btn-${variant} inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 font-semibold disabled:opacity-50 ${variant === 'primary' ? 'border-transparent' : 'border-[var(--line)] hover:border-[var(--accent-line)]'} ${className}`} {...props} />;
}
export function IconButton({ label, className='', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button aria-label={label} title={label} className={`pressable inline-grid size-10 place-items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] ${className}`} {...props}>{children}</button>;
}
export function Badge({ children, tone='default' }: { children: ReactNode; tone?: 'default'|'positive'|'warning' }) {
  const color = tone === 'positive' ? 'var(--positive)' : tone === 'warning' ? 'var(--warning)' : 'var(--accent)';
  const textColor = tone === 'positive' ? 'var(--positive-contrast)' : '#fff';
  return <span className="rounded-[var(--radius-pill)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm" style={{ background: color, color: textColor }}>{children}</span>;
}
export function Chip({ active=false, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button className="pressable shrink-0 rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-semibold hover:border-[var(--accent-line)]" style={{ background: active ? 'var(--text)' : 'var(--surface)', color: active ? 'var(--bg)' : 'var(--muted)', borderColor: active ? 'var(--text)' : 'var(--line)' }} {...props}>{children}</button>;
}
export function Skeleton({ className='' }: { className?: string }) { return <div aria-hidden className={`skeleton rounded-[var(--radius-md)] ${className}`} />; }
export function ScrollRail({ children, label, className='' }: { children: ReactNode; label: string; className?: string }) {
  const scroll = (event: React.MouseEvent<HTMLButtonElement>, amount: number) => {
    const rail = event.currentTarget.closest('[data-rail]')?.querySelector<HTMLElement>('[data-scroller]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail?.scrollBy({ left: amount, behavior: reduce ? 'auto' : 'smooth' });
  };
  return <div className={className} data-rail><div className="mb-3 flex items-center justify-between"><h2 className="lobby-title text-lg font-black">{label}</h2><div className="hidden gap-2 sm:flex"><IconButton label={`Previous ${label}`} onClick={(e)=>scroll(e,-500)}><ChevronLeft size={17}/></IconButton><IconButton label={`Next ${label}`} onClick={(e)=>scroll(e,500)}><ChevronRight size={17}/></IconButton></div></div><div data-scroller className="scrollbar-none -mx-1 flex snap-x gap-3.5 overflow-x-auto px-1 pb-4 pt-3">{children}</div></div>;
}
export const Box = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Box({ className='', ...props }, ref) { return <div ref={ref} className={className} {...props} />; });
