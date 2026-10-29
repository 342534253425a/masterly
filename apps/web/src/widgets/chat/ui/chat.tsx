'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Lock, MessagesSquare } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Composer } from '@/features/send-message';
import { ConversationItem, conversationQueries, MessageBubble } from '@/entities/conversation';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn, formatDate } from '@/shared/lib';
import { Avatar, Button, buttonVariants, EmptyState, Skeleton, Spinner } from '@/shared/ui';

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const { data } = useQuery(conversationQueries.messages(id));
  const bottom = useRef<HTMLDivElement>(null);
  const count = data?.items.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count]);
  if (!data) return <Spinner className="m-auto" />;
  const { conversation } = data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line p-3 sm:p-4">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label={t('title')}>
          <ArrowLeft />
        </Button>
        <Avatar initials={conversation.peer.initials} hue={conversation.peer.hue} size="md" online={conversation.peer.online} shape={conversation.peer.kind === 'master' ? 'squircle' : 'circle'} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{conversation.peer.name}</div>
          <div className="truncate text-xs text-muted">{conversation.peer.online ? t('online') : conversation.subject ?? t('offline')}</div>
        </div>
        {conversation.leadId ? (
          <Link href={routes.order(conversation.leadId)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            {t('toLead')}
          </Link>
        ) : null}
        {conversation.peer.slug ? (
          <Link href={routes.master(conversation.peer.slug)} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={t('toProfile')}>
            <ExternalLink />
          </Link>
        ) : null}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        <p className="mx-auto mb-3 flex max-w-sm items-center justify-center gap-1.5 text-center text-[11px] text-subtle">
          <Lock className="size-3" aria-hidden />
          {t('privacy')}
        </p>
        {data.items.map((message, index) => {
          // Разделитель дня — когда дата отличается от предыдущего сообщения (без изменяемых переменных в рендере)
          const day = formatDate(message.createdAt, locale, { day: 'numeric', month: 'long' });
          const previous = data.items[index - 1];
          const divider = !previous || formatDate(previous.createdAt, locale, { day: 'numeric', month: 'long' }) !== day;
          return (
            <div key={message.id}>
              {divider ? <div className="my-3 text-center text-[11px] font-semibold text-subtle">{day}</div> : null}
              <MessageBubble message={message} />
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <Composer conversationId={id} showQuickReplies={data.items.length < 3} />
    </div>
  );
}

/** Мессенджер: список диалогов + переписка. В живом режиме — сигналы WebSocket messaging, в демо — опрос. */
export function Chat() {
  const t = useTranslations('messages');
  const [active, setActive] = useQueryState('c', parseAsString);
  const { data, isPending } = useQuery(conversationQueries.list());

  if (!isPending && data?.length === 0) {
    return <EmptyState icon={<MessagesSquare />} title={t('empty')} description={t('emptyText')} />;
  }

  return (
    <div className="grid h-[calc(100dvh-11rem)] min-h-[480px] overflow-hidden rounded-3xl border border-line bg-surface shadow-card md:grid-cols-[320px_minmax(0,1fr)] lg:h-[calc(100dvh-8rem)]">
      <aside className={cn('flex min-h-0 flex-col border-line md:border-r', active && 'max-md:hidden')}>
        <div className="border-b border-line p-4 text-lg font-bold">{t('title')}</div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {isPending ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />) : null}
          {data?.map((conversation) => (
            <ConversationItem key={conversation.id} conversation={conversation} active={conversation.id === active} onSelect={() => void setActive(conversation.id)} />
          ))}
        </div>
      </aside>
      <section className={cn('min-h-0', !active && 'max-md:hidden')}>
        {active ? (
          <Thread id={active} onBack={() => void setActive(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
            <MessagesSquare className="size-10 text-subtle" />
            {t('select')}
          </div>
        )}
      </section>
    </div>
  );
}
