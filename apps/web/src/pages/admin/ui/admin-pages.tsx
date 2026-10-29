import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { requireUser } from '@/shared/server';
import { routes } from '@/shared/config';
import { Container, PageHeader } from '@/shared/ui';
import { AdminOverviewView, CatalogView, DuplicatesView, MarketAnalyticsView, ModerationView, UsersView } from './admin-views';

export async function AdminLayout({ children }: { children: ReactNode }) {
  await requireUser(routes.admin.root(), 'admin');
  return <Container className="py-8">{children}</Container>;
}

export async function AdminOverviewPage() {
  const t = await getTranslations('admin');
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AdminOverviewView />
    </>
  );
}

async function Section({ section, children }: { section: 'moderation' | 'duplicates' | 'catalog' | 'users' | 'analytics'; children: ReactNode }) {
  const t = await getTranslations(`admin.${section}`);
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {children}
    </>
  );
}

export const AdminModerationPage = () => (
  <Section section="moderation">
    <ModerationView />
  </Section>
);
export const AdminDuplicatesPage = () => (
  <Section section="duplicates">
    <DuplicatesView />
  </Section>
);
export const AdminCatalogPage = () => (
  <Section section="catalog">
    <CatalogView />
  </Section>
);
export const AdminUsersPage = () => (
  <Section section="users">
    <UsersView />
  </Section>
);
export const AdminAnalyticsPage = () => (
  <Section section="analytics">
    <MarketAnalyticsView />
  </Section>
);
