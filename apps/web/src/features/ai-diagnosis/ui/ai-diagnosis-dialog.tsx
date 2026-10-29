'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Info, Send, Smartphone, Sparkles, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { catalogQueries, hueFor, illustrationFor } from '@/entities/catalog';
import { useCurrentCity } from '@/entities/city';
import { masterQueries } from '@/entities/master';
import { routes } from '@/shared/config';
import { useRouter } from '@/shared/i18n';
import { formatPrice, track } from '@/shared/lib';
import { useDebouncedValue } from '@/shared/lib/hooks';
import { Badge, Button, Chip, DeviceIllustration, Dialog, DialogContent, GradientRibbon, Progress, Textarea } from '@/shared/ui';
import { useAiDiagnosis } from '../model/diagnosis-store';

const EXAMPLES = ['Упал в воду и не включается', 'Экран мигает и появились полосы', 'Садится за полдня, iPhone 12', 'Не слышно собеседника'];

export interface DiagnosisRequest {
  serviceId: string;
  modelId: string | null;
  brandId: string | null;
  description: string;
  urgent: boolean;
}

/**
 * AI-диагностика (MVP — NLP-классификатор на словаре каталога: стемминг, фразы, распознавание моделей).
 * Следующий этап — LLM/эмбеддинги за тем же контрактом /v1/search/suggest.
 */
export function AiDiagnosisDialog({ onRequest }: { onRequest: (request: DiagnosisRequest) => void }) {
  const { open, initial, close } = useAiDiagnosis();
  const t = useTranslations('ai');
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {open ? (
        <DialogContent size="lg" title={<span className="inline-flex items-center gap-2"><Sparkles className="size-5 text-accent" />{t('title')}</span>} description={t('subtitle')}>
          <DiagnosisBody initial={initial} onRequest={(request) => { close(); onRequest(request); }} onNavigate={close} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function DiagnosisBody({ initial, onRequest, onNavigate }: { initial: string; onRequest: (request: DiagnosisRequest) => void; onNavigate: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { slug: city } = useCurrentCity();
  const [text, setText] = useState(initial);
  const debounced = useDebouncedValue(text.trim(), 350);
  const { data, isFetching } = useQuery({ ...masterQueries.suggest(debounced, city), enabled: debounced.length >= 4 });
  const { data: services } = useQuery(catalogQueries.services(city));
  const interpretation = debounced.length >= 4 ? data?.interpretation : null;
  const top = interpretation?.services[0];
  const recognized = Boolean(top);

  const showMasters = () => {
    if (!top) return;
    track('ai_show_masters', { service: top.id });
    onNavigate();
    router.push(routes.search({ q: text.trim(), service: top.slug, model: interpretation?.model?.id, openNow: interpretation?.urgent || undefined, city }));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Textarea
          autoFocus
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('ai.placeholder')}
          className="min-h-24 pr-10 text-[15px]"
        />
        {isFetching ? <Sparkles className="absolute right-3.5 top-3.5 size-4 animate-pulse text-accent" aria-label={t('ai.thinking')} /> : null}
      </div>
      {!text ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-subtle">{t('ai.examples')}</span>
          {EXAMPLES.map((example) => (
            <Chip key={example} size="sm" onClick={() => setText(example)}>
              {example}
            </Chip>
          ))}
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {interpretation && recognized && top ? (
          <motion.div
            key={top.id + (interpretation.model?.id ?? '')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="relative overflow-hidden rounded-3xl border-gradient p-5"
          >
            <GradientRibbon className="absolute -right-24 -top-10 h-48 w-[420px] opacity-40" />
            <div className="relative flex gap-4">
              <DeviceIllustration variant={illustrationFor(top.id)} hue={hueFor(top.id)} className="hidden size-28 shrink-0 sm:block" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-accent dark:text-accent-2">{t('ai.diagnosis')}</div>
                <div className="mt-1 text-xl font-extrabold">{top.name}</div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={interpretation.confidence * 100} className="h-1.5 w-28" />
                  <span className="text-xs text-muted">{t('search.confidence', { value: `${Math.round(interpretation.confidence * 100)}%` })}</span>
                </div>
                {interpretation.services.length > 1 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-subtle">{t('ai.alternatives')}:</span>
                    {interpretation.services.slice(1).map((service) => (
                      <Badge key={service.id}>{service.name}</Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <dl className="relative mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <Smartphone className="size-3.5" aria-hidden /> {t('ai.device')}
                </dt>
                <dd className="mt-1 text-sm font-bold">{interpretation.model?.name ?? interpretation.brand?.name ?? <span className="font-medium text-subtle">{t('ai.deviceUnknown')}</span>}</dd>
              </div>
              {interpretation.priceHint ? (
                <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
                  <dt className="text-xs font-semibold text-muted">{t('ai.priceRange')}</dt>
                  <dd className="mt-1 text-sm font-bold">
                    {t('common.priceRange', { from: formatPrice(interpretation.priceHint.from, locale), to: formatPrice(interpretation.priceHint.to, locale) })}
                    <span className="ml-1.5 font-medium text-muted">· {t('ai.median', { price: formatPrice(interpretation.priceHint.median, locale) })}</span>
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              {interpretation.priceHint ? <span className="font-semibold text-fg">{t('ai.mastersReady', { count: interpretation.priceHint.mastersCount })}</span> : null}
              {interpretation.urgent ? (
                <Badge tone="warning">
                  <Zap aria-hidden />
                  {t('ai.urgentHint')}
                </Badge>
              ) : null}
            </div>

            <div className="relative mt-5 flex flex-col gap-2 sm:flex-row">
              <Button size="lg" className="flex-1" onClick={showMasters}>
                {t('ai.showMasters')}
                <ArrowRight />
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="flex-1"
                onClick={() =>
                  onRequest({
                    serviceId: top.id,
                    modelId: interpretation.model?.id ?? null,
                    brandId: interpretation.brand?.id ?? null,
                    description: text.trim(),
                    urgent: interpretation.urgent,
                  })
                }
              >
                <Send />
                {t('ai.sendRequest')}
              </Button>
            </div>
          </motion.div>
        ) : debounced.length >= 8 && !isFetching && data ? (
          <motion.div key="unknown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t('ai.notSure')}</p>
            <div className="flex flex-wrap gap-2">
              {services?.map((service) => (
                <Chip key={service.id} onClick={() => onRequest({ serviceId: service.id, modelId: null, brandId: null, description: text.trim(), urgent: false })}>
                  {service.short}
                </Chip>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p className="flex items-start gap-2 text-xs text-subtle">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        {t('ai.disclaimer')}
      </p>
    </div>
  );
}
