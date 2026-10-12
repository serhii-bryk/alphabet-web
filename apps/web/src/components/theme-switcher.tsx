'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Moon, Monitor, Sun } from 'lucide-react';
type Theme = 'dark'|'light'|'system';
const options = [{ id:'light' as const, themeKey:'lightTheme' as const, icon:Sun },{ id:'dark' as const, themeKey:'darkTheme' as const, icon:Moon },{ id:'system' as const, themeKey:'systemTheme' as const, icon:Monitor }];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('theme');
  const [theme,setTheme] = useState<Theme>('system');
  const mode = useRef<Theme>('system');
  useEffect(() => {
    // Hydrate the control from the preference already applied by the inline theme script.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const saved = (localStorage.getItem('theme') as Theme | null) ?? 'system'; setTheme(saved);
    mode.current = saved;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = (mode: Theme) => { document.documentElement.setAttribute('data-theme', mode === 'dark' || (mode === 'system' && media.matches) ? 'dark' : 'light'); document.documentElement.setAttribute('data-theme-mode', mode); };
    apply(saved); const listener=()=> mode.current === 'system' && apply('system'); media.addEventListener('change',listener); return ()=>media.removeEventListener('change',listener);
  },[]);
  const choose=(value:Theme)=>{mode.current=value;setTheme(value);localStorage.setItem('theme',value);const dark=value==='dark'||(value==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');document.documentElement.setAttribute('data-theme-mode',value);};
  return <fieldset className={`flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-1 ${compact ? 'flex-col items-center' : ''}`}><legend className="sr-only">{t('legend')}</legend>{options.map(({id,themeKey,icon:Icon})=><button key={id} type="button" aria-label={t(themeKey)} aria-pressed={theme===id} onClick={()=>choose(id)} className="grid size-8 place-items-center rounded-[var(--radius-sm)] transition" style={{background:theme===id?'var(--surface)':'transparent',color:theme===id?'var(--text)':'var(--muted)'}}><Icon size={15}/></button>)}</fieldset>;
}
