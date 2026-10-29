'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useSession } from '@/entities/session';
import { apiCall } from '@/shared/api';
import { routes } from '@/shared/config';
import { usePathname, useRouter } from '@/shared/i18n';
import { cn, track } from '@/shared/lib';
import { Button, toast } from '@/shared/ui';

const IDS_KEY = ['favorites', 'ids'] as const;

export const favoriteQueries = {
  ids: () =>
    queryOptions({
      queryKey: IDS_KEY,
      queryFn: async ({ signal }) => (await apiCall('favorites', {}, { signal })).map((master) => master.id),
      staleTime: 60_000,
    }),
  list: () => queryOptions({ queryKey: ['favorites', 'list'], queryFn: ({ signal }) => apiCall('favorites', {}, { signal }) }),
};

export function FavoriteButton({ masterId, withLabel, className }: { masterId: string; withLabel?: boolean; className?: string }) {
  const t = useTranslations();
  const { isAuthenticated } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: ids } = useQuery({ ...favoriteQueries.ids(), enabled: isAuthenticated });
  const active = ids?.includes(masterId) ?? false;

  // Оптимистичное обновление: сердечко реагирует мгновенно, при ошибке — откат
  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? apiCall('addFavorite', { params: { id: masterId } }) : apiCall('removeFavorite', { params: { id: masterId } })),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: IDS_KEY });
      const previous = queryClient.getQueryData<string[]>(IDS_KEY);
      queryClient.setQueryData<string[]>(IDS_KEY, (old = []) => (next ? [...old, masterId] : old.filter((id) => id !== masterId)));
      return { previous };
    },
    onError: (_error, _next, context) => queryClient.setQueryData(IDS_KEY, context?.previous),
    onSuccess: (_data, next) => {
      toast.success(next ? t('favorites.added') : t('favorites.removed'));
      track(next ? 'favorite_add' : 'favorite_remove', { masterId });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });

  const onClick = () => {
    if (!isAuthenticated) {
      toast(t('favorites.loginRequired'), { action: { label: t('nav.login'), onClick: () => router.push(routes.login(pathname)) } });
      return;
    }
    mutation.mutate(!active);
  };

  return (
    <Button
      variant={withLabel ? 'secondary' : 'ghost'}
      size={withLabel ? 'md' : 'icon-sm'}
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? t('master.inFavorites') : t('master.favorite')}
      className={cn(active && 'text-danger', className)}
    >
      <motion.span key={String(active)} initial={{ scale: active ? 0.4 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 14 }} className="inline-flex">
        <Heart className={cn(active && 'fill-danger text-danger')} />
      </motion.span>
      {withLabel ? (active ? t('master.inFavorites') : t('master.favorite')) : null}
    </Button>
  );
}
