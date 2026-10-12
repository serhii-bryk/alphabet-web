'use client';
import { useEffect, useState } from 'react';
type State='online'|'offline'|'reconnecting'|'back';
export function ConnectionStatus() {
  const [state,setState]=useState<State>('online');
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const offline=()=>setState('offline');const online=()=>{setState('reconnecting');timer=setTimeout(()=>{setState('back');timer=setTimeout(()=>setState('online'),2200)},700)};addEventListener('offline',offline);addEventListener('online',online);if(!navigator.onLine)offline();return()=>{removeEventListener('offline',offline);removeEventListener('online',online);clearTimeout(timer)}},[]);
  if(state==='online')return null;
  const text={offline:'Offline',reconnecting:'Reconnecting…',back:'Back online'}[state];
  return <div role="status" className="fixed bottom-20 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[var(--text)] px-4 py-2 text-sm font-semibold text-[var(--bg)] shadow-xl lg:bottom-5"><span className="mr-2 inline-block size-2 rounded-full" style={{background:state==='back'?'var(--positive)':'var(--warning)'}}/>{text}</div>;
}
