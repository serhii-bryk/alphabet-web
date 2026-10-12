import { RegistrationPage } from '@/components/auth/registration-page';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('registerTitle', 'registerDescription');
}

export default function Page() {
  return <RegistrationPage />;
}
