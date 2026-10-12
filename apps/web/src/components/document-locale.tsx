'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';

export function DocumentLocale() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  return null;
}
