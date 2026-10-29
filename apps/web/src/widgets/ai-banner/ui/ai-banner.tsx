'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAiDiagnosis } from '@/features/ai-diagnosis';
import { Badge, Button, Container, DotField, GradientRibbon } from '@/shared/ui';

/** Баннер AI-ассистента — как в референсе: шёлковая лента, частицы и CTA. */
export function AiBanner() {
  const t = useTranslations('home.ai');
  const openDiagnosis = useAiDiagnosis((s) => s.openDiagnosis);
  return (
    <section>
      <Container>
        <div className="relative isolate overflow-hidden rounded-[28px] border-gradient px-6 py-7 shadow-card sm:px-9 sm:py-9">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_120%_at_85%_40%,rgb(139_92_246/0.22),transparent_60%)]" />
          <GradientRibbon className="absolute -right-24 top-0 -z-10 h-full w-[85%] opacity-90 sm:right-0 sm:w-[70%]" />
          <DotField className="absolute right-[38%] top-0 -z-10 hidden h-full w-72 opacity-60 md:block" />
          <div className="max-w-xl">
            <Badge tone="accent" size="lg">
              <Sparkles aria-hidden />
              {t('badge')}
            </Badge>
            <h2 className="mt-4 text-[20px] font-bold leading-snug sm:text-[24px]">{t('title')}</h2>
            <Button size="lg" variant="secondary" className="mt-6 border-accent/40 bg-accent-soft hover:bg-accent/25" onClick={() => openDiagnosis()}>
              {t('cta')}
              <ArrowRight />
            </Button>
          </div>
          <p className="absolute right-9 top-1/2 hidden max-w-[150px] -translate-y-1/2 border-l border-line-strong pl-4 text-[13px] leading-snug text-muted xl:block">{t('aside')}</p>
        </div>
      </Container>
    </section>
  );
}
