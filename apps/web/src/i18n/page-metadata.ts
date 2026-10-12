import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function translatedMetadata(titleKey: string, descriptionKey?: string): Promise<Metadata> {
  const meta = await getTranslations('meta');
  return descriptionKey
    ? { title: meta(titleKey), description: meta(descriptionKey) }
    : { title: meta(titleKey) };
}
