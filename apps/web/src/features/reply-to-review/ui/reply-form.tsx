'use client';

import type { Review } from '@masterly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CornerDownRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cabinetQueries } from '@/entities/master';
import { apiCall, errorMessage } from '@/shared/api';
import { Button, Textarea, toast } from '@/shared/ui';

export function ReplyForm({ review }: { review: Review }) {
  const t = useTranslations('cabinet.reviews');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const queryClient = useQueryClient();
  const reply = useMutation({
    mutationFn: () => apiCall('replyToReview', { params: { id: review.id }, body: { text } }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Review[]>(cabinetQueries.reviews().queryKey, (old) => old?.map((r) => (r.id === updated.id ? updated : r)));
      setOpen(false);
      toast.success(t('replied'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (review.reply) return null;
  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <CornerDownRight />
        {t('reply')}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Textarea autoFocus className="min-h-20" placeholder={t('replyPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          ✕
        </Button>
        <Button size="sm" disabled={text.trim().length < 2} loading={reply.isPending} onClick={() => reply.mutate()}>
          {t('send')}
        </Button>
      </div>
    </div>
  );
}
