import type { Metadata } from 'next';
import { AuthCallback } from '@/components/auth/auth-callback';

export const metadata: Metadata = { referrer: 'no-referrer', title: 'AlphaBet' };

export default function AuthCallbackPage() {
  return <AuthCallback />;
}
