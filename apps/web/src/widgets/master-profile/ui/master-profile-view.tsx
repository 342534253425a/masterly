'use client';

import type { MasterCard } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, Send, Share2, ShieldCheck, Star, Trophy, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CompareToggle } from '@/features/compare-masters';
import { RevealContactsButton, WriteToMasterButton } from '@/features/contact-master';
import { useLeadWizard } from '@/features/create-lead';
import { ReportButton } from '@/features/report-abuse';
import { FavoriteButton } from '@/features/toggle-favorite';
import { masterQueries, MasterAvatar, MasterMiniCard, OpenStatus, PriceTag, PromotedLabel, VerifiedBadge, warrantyMonths } from '@/entities/master';
import { usePathname, useRouter } from '@/shared/i18n';
import { formatDuration } from '@/shared/lib';
import { Badge, Button, Card, Container, DeviceIllustration, GlowOrb, RatingValue, SectionHeader, Tabs, TabsContent, TabsList, TabsTrigger, toast } from '@/shared/ui';
import { AboutSection, OffersTable, ReviewsSection, WorksGallery } from './master-sections';

export function MasterProfileView({ slug, context, similar }: { slug: string; context: { service?: string; model?: string }; similar: MasterCard[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [modelId, setModelId] = useState<string | null>(context.model ?? null);
  const { data: master } = useQuery(masterQueries.detail(slug, { ...context, model: modelId ?? undefined }));
  const openWizard = useLeadWizard((s) => s.openWizard);
  if (!master) return null;

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: master.name, url }).catch(() => {});
    else {
      await navigator.clipboard.writeText(url);
      toast.success(t('common.linkCopied'));
    }
  };
  const request = () =>
    openWizard({ masterIds: [master.id], masterNames: [master.name], serviceId: master.price?.serviceId ?? null, modelId: master.price?.modelId ?? modelId, brandId: null });
  const changeModel = (next: string | null) => {
    setModelId(next);
    const params = new URLSearchParams(window.location.search);
    if (next) params.set('model', next);
    else params.delete('model');
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
  };

  const stats = [
    { icon: Star, label: t('master.stats.rating'), value: master.rating.toFixed(1), hint: t('common.reviews', { count: master.reviewsCount }) },
    { icon: Clock, label: t('master.stats.response'), value: `~${formatDuration(master.responseTimeMin, locale)}`, hint: `${Math.round(master.responseRate * 100)}%` },
    { icon: ShieldCheck, label: t('master.stats.warranty'), value: `${warrantyMonths(master.warrantyDays)} мес.`, hint: master.partsQualities.map((p) => t(`search.parts.${p}`)).join(' · ') },
    { icon: Trophy, label: t('master.stats.experience'), value: t('common.years', { count: master.experienceYears }), hint: t('master.completed', { count: master.completedOrders }) },
  ];

  return (
    <div className="pb-28 lg:pb-12">
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-64" style={{ background: `radial-gradient(70% 120% at 20% 0%, hsl(${master.hue} 80% 55% / 0.35), transparent 70%), radial-gradient(60% 100% at 90% 10%, hsl(${(master.hue + 60) % 360} 80% 55% / 0.22), transparent 70%)` }} />
        <GlowOrb className="absolute -right-10 top-0 -z-10 size-72" hue={master.hue} />
        <DeviceIllustration variant="screen" hue={master.hue} className="absolute -right-6 top-6 -z-10 hidden h-56 w-auto opacity-80 md:block" />
        <Container className="pt-8 sm:pt-12">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <MasterAvatar master={master} size="2xl" className="shadow-glow ring-4 ring-[var(--bg)]" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge size="lg">{t(`master.kind.${master.kind}`)}</Badge>
                {master.plan === 'pro' ? <Badge tone="accent" size="lg">PRO</Badge> : null}
                {master.express ? (
                  <Badge tone="warning" size="lg">
                    <Zap aria-hidden />
                    {t('master.express')}
                  </Badge>
                ) : null}
                {master.promoted ? <PromotedLabel promoted={master.promoted} /> : null}
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-[40px]">{master.name}</h1>
              <p className="mt-1.5 text-[15px] text-muted">{master.tagline}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                <RatingValue rating={master.rating} count={master.reviewsCount} />
                {master.verified ? <VerifiedBadge verification={master.verification} /> : null}
                <OpenStatus state={master.openState} />
                <span className="inline-flex items-center gap-1 text-muted">
                  <MapPin className="size-3.5" aria-hidden /> {master.districtName} · {master.landmark}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <FavoriteButton masterId={master.id} />
              <CompareToggle master={master} />
              <Button variant="ghost" size="icon-sm" onClick={() => void share()} aria-label={t('master.share')}>
                <Share2 />
              </Button>
              <ReportButton subjectType="master" subjectId={master.id} compact />
            </div>
          </div>
        </Container>
      </section>

      <Container className="mt-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="flex flex-col gap-1 p-4">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <stat.icon className="size-3.5 text-accent" aria-hidden /> {stat.label}
              </span>
              <span className="text-xl font-extrabold tracking-tight">{stat.value}</span>
              <span className="truncate text-xs text-subtle">{stat.hint}</span>
            </Card>
          ))}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Tabs defaultValue="services">
            <TabsList className="mb-5">
              <TabsTrigger value="services">{t('master.tabs.services')}</TabsTrigger>
              <TabsTrigger value="reviews">
                {t('master.tabs.reviews')} <span className="text-subtle">{master.reviewsCount}</span>
              </TabsTrigger>
              <TabsTrigger value="works">
                {t('master.tabs.works')} <span className="text-subtle">{master.photos.length}</span>
              </TabsTrigger>
              <TabsTrigger value="about">{t('master.tabs.about')}</TabsTrigger>
            </TabsList>
            <TabsContent value="services">
              <OffersTable master={master} modelId={modelId} onModelChange={changeModel} />
            </TabsContent>
            <TabsContent value="reviews">
              <ReviewsSection master={master} />
            </TabsContent>
            <TabsContent value="works">
              <WorksGallery master={master} />
            </TabsContent>
            <TabsContent value="about">
              <AboutSection master={master} />
            </TabsContent>
          </Tabs>

          <aside className="hidden lg:block">
            <Card variant="gradient" className="sticky top-20 flex flex-col gap-3 p-5">
              {master.price ? (
                <div>
                  <div className="text-xs font-semibold text-muted">{t('master.price')}</div>
                  <PriceTag range={master.price.range} size="lg" />
                </div>
              ) : null}
              <Button size="lg" className="w-full" onClick={request}>
                <Send />
                {t('master.request')}
              </Button>
              <WriteToMasterButton masterId={master.id} />
              <RevealContactsButton masterId={master.id} phoneMasked={master.contacts.phoneMasked} />
              <p className="text-xs leading-relaxed text-subtle">{t('orders.paymentNote')}</p>
            </Card>
          </aside>
        </div>

        {similar.length ? (
          <section className="mt-14">
            <SectionHeader title={t('master.similar')} />
            <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {similar.map((item) => (
                <MasterMiniCard key={item.id} master={item} />
              ))}
            </div>
          </section>
        ) : null}
      </Container>

      <div className="glass fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 border-t border-line p-3 lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {master.price ? <PriceTag range={master.price.range} size="sm" className="min-w-0 flex-1 truncate" /> : <span className="flex-1" />}
          <Button className="shrink-0" onClick={request}>
            <Send />
            {t('master.request')}
          </Button>
        </div>
      </div>
    </div>
  );
}
