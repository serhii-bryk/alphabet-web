'use client';

import type { ReactNode } from 'react';
import { useSession } from './session';

export function GuestAcquisition({
  children,
  replacement = null,
}: {
  children: ReactNode;
  replacement?: ReactNode;
}) {
  const { status } = useSession();
  if (status === 'guest') return children;
  if (status === 'authenticated') return replacement;
  return null;
}
