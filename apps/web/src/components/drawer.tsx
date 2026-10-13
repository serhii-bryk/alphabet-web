'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { IconButton } from './ui';

export function Drawer({ open, onClose, title, children }: { open:boolean; onClose:()=>void; title:string; children:ReactNode }) {
  const t = useTranslations('shell');
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{ if(!open)return; const previous=document.activeElement as HTMLElement|null; panel.current?.focus(); const key=(e:KeyboardEvent)=>e.key==='Escape'&&onClose(); addEventListener('keydown',key); return()=>{removeEventListener('keydown',key);previous?.focus();};},[open,onClose]);
  if(!open)return null;
  return <div className="fixed inset-0 z-[70]"><button className="modal-backdrop absolute inset-0 bg-black/55" aria-label={t('closeMenu')} onClick={onClose}/><div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="surface drawer-panel absolute bottom-0 start-0 top-0 w-[min(88vw,360px)] overflow-y-auto p-4 outline-none"><div className="mb-6 flex items-center justify-between"><strong>{title}</strong><IconButton label={t('close')} onClick={onClose}><X size={18}/></IconButton></div>{children}</div></div>;
}
