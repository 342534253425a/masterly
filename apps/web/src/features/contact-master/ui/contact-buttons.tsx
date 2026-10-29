'use client';

import type { ContactReveal } from '@masterly/contracts';
import { useMutation } from '@tanstack/react-query';
import { MessageCircle, Phone, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSession } from '@/entities/session';
import { apiCall, errorMessage } from '@/shared/api';
import { routes } from '@/shared/config';
import { Link, usePathname, useRouter } from '@/shared/i18n';
import { cn, track } from '@/shared/lib';
import { Button, buttonVariants, Popover, PopoverContent, PopoverTrigger, toast } from '@/shared/ui';

/**
 * Контролируемое раскрытие контактов: только для вошедших, с лимитом и журналированием
 * (защита мастеров от спама и скрейпинга; метрика «переходы к контактам» в кабинете).
 */
export function RevealContactsButton({ masterId, phoneMasked, className }: { masterId: string; phoneMasked: string; className?: string }) {
  const t = useTranslations();
  const { isAuthenticated } = useSession();
  const pathname = usePathname();
  const [contacts, setContacts] = useState<ContactReveal | null>(null);
  const reveal = useMutation({
    mutationFn: () => apiCall('revealContacts', { params: { id: masterId } }),
    onSuccess: (data) => {
      setContacts(data);
      track('contact_reveal', { masterId });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (contacts) {
    return (
      <div className={cn('flex flex-col gap-2 rounded-2xl border border-success/30 bg-success-soft p-3', className)}>
        <a href={`tel:${contacts.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <Phone className="size-4 text-success" aria-hidden />
          {contacts.phone}
        </a>
        <div className="flex flex-wrap gap-2">
          {contacts.telegram ? (
            <a href={`https://t.me/${contacts.telegram.replace('@', '')}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'xs' })}>
              <Send /> Telegram
            </a>
          ) : null}
          {contacts.whatsapp ? (
            <a href={`https://wa.me/${contacts.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'xs' })}>
              WhatsApp
            </a>
          ) : null}
        </div>
        <p className="text-xs text-muted">{t('master.callNote')}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="lg" className={cn('w-full', className)}>
            <Phone />
            {phoneMasked}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-72 p-4">
          <p className="text-sm text-muted">{t('master.loginForContacts')}</p>
          <Link href={routes.login(pathname)} className={cn(buttonVariants({ size: 'sm' }), 'mt-3 w-full')}>
            {t('nav.login')}
          </Link>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Button variant="secondary" size="lg" className={cn('w-full', className)} loading={reveal.isPending} onClick={() => reveal.mutate()}>
      <Phone />
      {t('master.showPhone')}
    </Button>
  );
}

export function WriteToMasterButton({ masterId, leadId = null, className, size = 'lg' }: { masterId: string; leadId?: string | null; className?: string; size?: 'md' | 'lg' }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useSession();
  const start = useMutation({
    mutationFn: () => apiCall('startConversation', { body: { masterId, leadId } }),
    onSuccess: (conversation) => router.push(routes.messages(conversation.id)),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Button
      variant="secondary"
      size={size}
      className={cn('w-full', className)}
      loading={start.isPending}
      onClick={() => (isAuthenticated ? start.mutate() : router.push(routes.login(pathname)))}
    >
      <MessageCircle />
      {t('master.write')}
    </Button>
  );
}
