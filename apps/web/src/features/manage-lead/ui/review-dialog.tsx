'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CreateReview } from '@masterly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { leadQueries } from '@/entities/lead';
import { apiCall, errorMessage } from '@/shared/api';
import { cn, track } from '@/shared/lib';
import { Button, Dialog, DialogContent, Field, Textarea, toast } from '@/shared/ui';

type Values = z.input<typeof CreateReview>;

/** Отзыв только по завершённой заявке — валидация той же zod-схемой, что и на бэкенде. */
export function ReviewDialog({ leadId, masterName }: { leadId: string; masterName: string }) {
  const t = useTranslations('reviews');
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(0);
  const queryClient = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(CreateReview), defaultValues: { leadId, rating: 5, text: '' } });
  const rating = form.watch('rating');
  const submit = useMutation({
    mutationFn: (values: Values) => apiCall('createReview', { body: values }),
    onSuccess: () => {
      toast.success(t('thanks'));
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: leadQueries.detail(leadId).queryKey });
      track('review_created', { leadId, rating });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
        <Star />
        {t('write')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('formTitle')} description={masterName}>
          <form onSubmit={form.handleSubmit((values) => submit.mutate(values))} className="flex flex-col gap-5">
            <Field label={t('formRating')}>
              <div className="flex gap-1.5" onMouseLeave={() => setHover(0)} role="radiogroup">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={`${value}`}
                    onMouseEnter={() => setHover(value)}
                    onClick={() => form.setValue('rating', value)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star className={cn('size-9', (hover || rating) >= value ? 'fill-amber-400 text-amber-400' : 'text-surface-3')} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('formText')} htmlFor="review-text" error={form.formState.errors.text?.message}>
              <Textarea id="review-text" placeholder={t('formPlaceholder')} invalid={Boolean(form.formState.errors.text)} {...form.register('text')} />
            </Field>
            <Button type="submit" size="lg" loading={submit.isPending}>
              {t('submit')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
