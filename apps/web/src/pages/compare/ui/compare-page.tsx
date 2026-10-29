import { getTranslations } from 'next-intl/server';
import { CompareTable } from '@/widgets/compare-table';
import { Container, PageHeader } from '@/shared/ui';

export async function generateCompareMetadata() {
  const t = await getTranslations('compare');
  return { title: t('title'), robots: { index: false } };
}

export async function ComparePage() {
  const t = await getTranslations('compare');
  return (
    <Container className="py-8">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CompareTable />
    </Container>
  );
}
