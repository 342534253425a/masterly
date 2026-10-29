'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';
import { AiDiagnosisDialog } from '@/features/ai-diagnosis';
import { PhoneLoginForm } from '@/features/auth';
import { CompareTray } from '@/features/compare-masters';
import { LeadWizard, useLeadWizard } from '@/features/create-lead';
import { usePathname } from '@/shared/i18n';
import { useHydrated } from '@/shared/lib/hooks';
import { useShellPrefs } from '../model/shell-store';
import { MobileTabBar } from './mobile-tabbar';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/**
 * Каркас приложения: сайдбар (desktop), топбар, нижняя навигация (mobile) и глобальные
 * диалоги — мастер заявки и AI-диагностика. Здесь же связываются фичи между собой (FSD:
 * фичи не импортируют друг друга, их композирует слой выше).
 */
export function AppShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const hydrated = useHydrated();
  const collapsed = useShellPrefs((s) => s.collapsed) && hydrated;
  const openWizard = useLeadWizard((s) => s.openWizard);
  const fullBleed = pathname.startsWith('/search') || pathname.startsWith('/messages');

  return (
    <div style={{ '--sidebar-width': collapsed ? '84px' : '272px' } as CSSProperties}>
      <a href="#main" className="sr-only z-50 rounded-xl bg-elevated px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t('skipToContent')}
      </a>
      <Sidebar />
      <div className="min-h-dvh transition-[padding] duration-300 lg:pl-[var(--sidebar-width)]">
        <Topbar />
        <motion.main
          id="main"
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
          className="pb-28 lg:pb-0"
        >
          {children}
          {fullBleed ? null : footer}
        </motion.main>
      </div>
      <MobileTabBar />
      <CompareTray />
      <LeadWizard renderAuth={() => <PhoneLoginForm />} />
      <AiDiagnosisDialog
        onRequest={(request) =>
          openWizard({ serviceId: request.serviceId, modelId: request.modelId, brandId: request.brandId, description: request.description, urgent: request.urgent })
        }
      />
    </div>
  );
}
