import { getTranslations } from 'next-intl/server';
import { SettingsPanel } from '@/features/manage-settings';
import { LocaleSwitch } from '@/features/switch-locale';
import { ThemeSegmented } from '@/features/toggle-theme';
import { Container, PageHeader } from '@/shared/ui';

export async function generateSettingsMetadata() {
  const t = await getTranslations('settings');
  return { title: t('title'), robots: { index: false } };
}

/** Настройки доступны и гостю (интерфейс, доступность) — регистрация не обязательна. */
export async function SettingsPage() {
  const t = await getTranslations('settings');
  return (
    <Container className="py-8">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <SettingsPanel
        appearance={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ThemeSegmented />
            <LocaleSwitch withLabel />
          </div>
        }
      />
    </Container>
  );
}
