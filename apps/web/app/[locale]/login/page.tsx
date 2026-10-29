import { Suspense } from 'react';
import { LoginPage } from '@/pages/login';

export const metadata = { title: 'Вход', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
