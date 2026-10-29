import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { CabinetOverview, LeadsBoard } from '@/widgets/cabinet-dashboard';
import { ProfileForm } from '@/features/edit-master-profile';
import { OffersEditor } from '@/features/edit-offers';
import { ScheduleEditor } from '@/features/edit-schedule';
import { requireUser } from '@/shared/server';
import { routes } from '@/shared/config';
import { Container, PageHeader } from '@/shared/ui';
import { CabinetAnalyticsView, CabinetBillingView, CabinetReviewsView, CabinetTeamView } from './cabinet-views';

/** Доступ к кабинету — только роль «мастер» (UX-проверка; авторизация — в API Gateway). */
export async function CabinetLayout({ children }: { children: ReactNode }) {
  await requireUser(routes.cabinet.root(), 'master');
  return <Container className="py-8">{children}</Container>;
}

type Section = 'leads' | 'services' | 'schedule' | 'profile' | 'reviews' | 'analytics' | 'team' | 'billing';

async function Header({ section }: { section: Section }) {
  const t = await getTranslations(`cabinet.${section}`);
  return <PageHeader title={t('title')} description={t('subtitle')} />;
}

export const CabinetOverviewPage = () => <CabinetOverview />;

export const CabinetLeadsPage = async () => (
  <>
    <Header section="leads" />
    <LeadsBoard />
  </>
);

export const CabinetServicesPage = async () => (
  <>
    <Header section="services" />
    <OffersEditor />
  </>
);

export const CabinetSchedulePage = async () => (
  <>
    <Header section="schedule" />
    <ScheduleEditor />
  </>
);

export const CabinetProfilePage = async () => (
  <>
    <Header section="profile" />
    <ProfileForm />
  </>
);

export const CabinetReviewsPage = async () => (
  <>
    <Header section="reviews" />
    <CabinetReviewsView />
  </>
);

export const CabinetAnalyticsPage = async () => (
  <>
    <Header section="analytics" />
    <CabinetAnalyticsView />
  </>
);

export const CabinetTeamPage = async () => (
  <>
    <Header section="team" />
    <CabinetTeamView />
  </>
);

export const CabinetBillingPage = async () => (
  <>
    <Header section="billing" />
    <CabinetBillingView />
  </>
);
