'use client';

import { useMutation } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSession } from '@/entities/session';
import { apiCall, errorMessage } from '@/shared/api';
import { routes } from '@/shared/config';
import { usePathname, useRouter } from '@/shared/i18n';
import { cn } from '@/shared/lib';
import { Button, Dialog, DialogContent, Textarea, toast } from '@/shared/ui';

const REASONS = [
  ['fake', 'Недостоверная информация или фейк'],
  ['fraud', 'Мошенничество'],
  ['spam', 'Спам или навязчивая реклама'],
  ['offensive', 'Оскорбления'],
  ['wrong_info', 'Неверные цены или контакты'],
  ['other', 'Другое'],
] as const;

/** Жалоба уходит в очередь модерации trust-сервиса. */
export function ReportButton({ subjectType, subjectId, compact }: { subjectType: 'master' | 'review' | 'photo'; subjectId: string; compact?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>('fake');
  const [note, setNote] = useState('');
  const report = useMutation({
    mutationFn: () => apiCall('createReport', { body: { subjectType, subjectId, reason, note: note || undefined } }),
    onSuccess: () => {
      setOpen(false);
      toast.success('Жалоба отправлена модераторам');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button
        variant="ghost"
        size={compact ? 'icon-sm' : 'sm'}
        aria-label={t('master.report')}
        onClick={() => (isAuthenticated ? setOpen(true) : router.push(routes.login(pathname)))}
      >
        <Flag />
        {compact ? null : t('master.report')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={t('master.report')}
          size="sm"
          footer={
            <Button className="w-full" loading={report.isPending} onClick={() => report.mutate()}>
              {t('common.confirm')}
            </Button>
          }
        >
          <div className="flex flex-col gap-2" role="radiogroup">
            {REASONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={reason === value}
                onClick={() => setReason(value)}
                className={cn('rounded-2xl border px-3.5 py-2.5 text-left text-sm transition', reason === value ? 'border-accent/60 bg-accent-soft font-semibold' : 'border-line hover:border-line-strong')}
              >
                {label}
              </button>
            ))}
            <Textarea className="mt-2 min-h-20" placeholder="Комментарий (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
