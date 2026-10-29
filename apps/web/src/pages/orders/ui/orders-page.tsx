import { getTranslations } from 'next-intl/server';
import { OrderDetails } from '@/widgets/order-details';
import { requireUser } from '@/shared/server';
import { routes } from '@/shared/config';
import { Container, PageHeader } from '@/shared/ui';
import { OrdersView } from './orders-view';

export async function generateOrdersMetadata() {
  const t = await getTranslations('orders');
  return { title: t('title'), robots: { index: false } };
}

export async function OrdersPage() {
  await requireUser(routes.orders());
  const t = await getTranslations('orders');
  return (
    <Container className="max-w-4xl py-8">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <OrdersView />
    </Container>
  );
}

export async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(routes.order(id));
  return (
    <Container className="py-8">
      <OrderDetails id={id} />
    </Container>
  );
}
