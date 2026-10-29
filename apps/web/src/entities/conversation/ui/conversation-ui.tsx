import type { Conversation, Message } from '@masterly/contracts';
import { Check, CheckCheck, Headset, Tag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn, formatRelative, formatTime } from '@/shared/lib';
import { Avatar } from '@/shared/ui';

export function ConversationItem({ conversation, active, onSelect }: { conversation: Conversation; active?: boolean; onSelect?: () => void }) {
  const locale = useLocale();
  const { peer, lastMessage } = conversation;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors',
        active ? 'bg-accent-soft' : 'hover:bg-surface-2',
      )}
    >
      {peer.kind === 'support' ? (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <Headset className="size-5" aria-hidden />
        </span>
      ) : (
        <Avatar initials={peer.initials} hue={peer.hue} size="md" online={peer.online} shape={peer.kind === 'master' ? 'squircle' : 'circle'} className="size-11" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold">{peer.name}</span>
          {lastMessage ? <span className="shrink-0 text-[11px] text-subtle">{formatRelative(lastMessage.at, locale)}</span> : null}
        </div>
        {conversation.subject ? <div className="truncate text-[11px] font-medium text-accent dark:text-accent-2">{conversation.subject}</div> : null}
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-[13px]', conversation.unread ? 'font-semibold text-fg' : 'text-muted')}>
            {lastMessage ? `${lastMessage.fromMe ? '✓ ' : ''}${lastMessage.text}` : '—'}
          </span>
          {conversation.unread > 0 ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{conversation.unread}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const t = useTranslations('messages');
  const locale = useLocale();
  if (message.kind === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-center text-[12px] text-muted">{message.text}</span>
      </div>
    );
  }
  return (
    <div className={cn('flex', message.fromMe ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] rounded-[22px] px-4 py-2.5 text-[14px] leading-relaxed shadow-sm sm:max-w-[70%]',
          message.fromMe ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-surface text-fg',
          message.kind === 'offer' && !message.fromMe && 'border-accent/40 bg-accent-soft',
        )}
      >
        {message.kind === 'offer' ? (
          <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-accent dark:text-accent-2">
            <Tag className="size-3" aria-hidden /> Предложение
          </div>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <div className={cn('mt-0.5 flex items-center justify-end gap-1 text-[10px]', message.fromMe ? 'text-white/70' : 'text-subtle')}>
          {formatTime(message.createdAt, locale)}
          {message.fromMe ? (
            message.status === 'read' ? (
              <CheckCheck className="size-3.5" aria-label={t('read')} />
            ) : (
              <Check className="size-3.5" aria-label={t('delivered')} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
