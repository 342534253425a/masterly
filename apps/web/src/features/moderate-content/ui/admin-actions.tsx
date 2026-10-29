'use client';

import type { AdminService, AdminUser, DuplicateCandidate, ModerationItem } from '@masterly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Ban, Check, GitMerge, Rocket, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { z } from 'zod';
import type { AdminCategory as AdminCategorySchema } from '@masterly/contracts';
import { apiCall, errorMessage } from '@/shared/api';
import { Button, Switch, toast } from '@/shared/ui';

type CategoryDto = z.infer<typeof AdminCategorySchema>;

/** Решение модератора: оптимистично убираем элемент из очереди, событие уходит в trust-сервис. */
export function ModerationDecision({ item }: { item: ModerationItem }) {
  const t = useTranslations('admin.moderation');
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject' | 'escalate') => apiCall('moderate', { params: { id: item.id }, body: { decision } }),
    onMutate: (decision) => {
      queryClient.setQueriesData<ModerationItem[]>({ queryKey: ['admin', 'moderation'] }, (old) => old?.filter((i) => i.id !== item.id));
      return decision;
    },
    onSuccess: () => {
      toast.success(t('decided'));
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
    },
  });
  if (item.status !== 'pending') return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="success" onClick={() => decide.mutate('approve')}>
        <Check />
        {t('approve')}
      </Button>
      <Button size="sm" variant="danger" onClick={() => decide.mutate('reject')}>
        <X />
        {t('reject')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => decide.mutate('escalate')}>
        <ArrowUpRight />
        {t('escalate')}
      </Button>
    </div>
  );
}

export function DuplicateResolution({ candidate }: { candidate: DuplicateCandidate }) {
  const t = useTranslations('admin.duplicates');
  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: (action: 'merge' | 'dismiss') => apiCall('resolveDuplicate', { params: { id: candidate.id }, body: { action, primaryId: candidate.a.id } }),
    onSuccess: (updated, action) => {
      queryClient.setQueryData<DuplicateCandidate[]>(['admin', 'duplicates'], (old) => old?.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(action === 'merge' ? t('merged') : t('dismissed'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (candidate.status !== 'open') return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" loading={resolve.isPending && resolve.variables === 'merge'} onClick={() => resolve.mutate('merge')}>
        <GitMerge />
        {t('merge')}
      </Button>
      <Button size="sm" variant="secondary" loading={resolve.isPending && resolve.variables === 'dismiss'} onClick={() => resolve.mutate('dismiss')}>
        {t('dismiss')}
      </Button>
    </div>
  );
}

export function ServiceToggle({ service }: { service: AdminService }) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (enabled: boolean) => apiCall('updateAdminService', { params: { id: service.id }, body: { enabled } }),
    onSuccess: (updated) => queryClient.setQueryData<AdminService[]>(['admin', 'services'], (old) => old?.map((s) => (s.id === updated.id ? updated : s))),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return <Switch checked={service.enabled} onCheckedChange={(enabled) => update.mutate(enabled)} aria-label={service.name} />;
}

export function CategoryLaunch({ category }: { category: CategoryDto }) {
  const t = useTranslations('admin.catalog');
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (status: 'active' | 'soon') => apiCall('updateCategory', { params: { id: category.id }, body: { status } }),
    onSuccess: (updated) => {
      queryClient.setQueryData<CategoryDto[]>(['admin', 'categories'], (old) => old?.map((c) => (c.id === updated.id ? updated : c)));
      if (updated.status === 'active') toast.success(t('launched'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return category.status === 'soon' ? (
    <Button size="xs" onClick={() => update.mutate('active')} loading={update.isPending}>
      <Rocket />
      {t('launch')}
    </Button>
  ) : (
    <Button size="xs" variant="secondary" onClick={() => update.mutate('soon')} loading={update.isPending}>
      {t('hide')}
    </Button>
  );
}

export function UserAccessControls({ user }: { user: AdminUser }) {
  const t = useTranslations('admin.users');
  const tRoles = useTranslations('nav.roles');
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (body: { roles?: AdminUser['roles']; status?: AdminUser['status'] }) => apiCall('updateAdminUser', { params: { id: user.id }, body }),
    onSuccess: (updated) => {
      queryClient.setQueriesData<AdminUser[]>({ queryKey: ['admin', 'users'] }, (old) => old?.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(t('updated'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(['client', 'master', 'admin'] as const).map((role) => {
        const has = user.roles.includes(role);
        return (
          <button
            key={role}
            type="button"
            aria-pressed={has}
            onClick={() => {
              const roles = has ? user.roles.filter((r) => r !== role) : [...user.roles, role];
              if (roles.length) update.mutate({ roles });
            }}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${has ? 'border-accent/50 bg-accent-soft text-fg' : 'border-line text-subtle hover:text-fg'}`}
          >
            {tRoles(role)}
          </button>
        );
      })}
      <Button
        size="xs"
        variant={user.status === 'active' ? 'ghost' : 'soft'}
        className={user.status === 'active' ? 'text-danger' : ''}
        onClick={() => update.mutate({ status: user.status === 'active' ? 'blocked' : 'active' })}
      >
        {user.status === 'active' ? <Ban /> : <ShieldCheck />}
        {user.status === 'active' ? t('block') : t('unblock')}
      </Button>
    </div>
  );
}
