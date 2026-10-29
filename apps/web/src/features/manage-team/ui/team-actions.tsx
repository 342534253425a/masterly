'use client';

import type { CabinetTeam } from '@masterly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cabinetQueries } from '@/entities/master';
import { apiCall, errorMessage } from '@/shared/api';
import { Button, Chip, Dialog, DialogContent, Field, Input, toast } from '@/shared/ui';

function useTeamUpdate(success: string) {
  const queryClient = useQueryClient();
  return (team: CabinetTeam) => {
    queryClient.setQueryData(cabinetQueries.team().queryKey, team);
    toast.success(success);
  };
}

export function InviteStaffDialog({ team }: { team: CabinetTeam }) {
  const t = useTranslations('cabinet.team');
  const tm = useTranslations('master');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7');
  const [role, setRole] = useState<'senior' | 'master' | 'manager'>('master');
  const [branchId, setBranchId] = useState<string | null>(null);
  const onDone = useTeamUpdate(t('invited'));
  const invite = useMutation({
    mutationFn: () => apiCall('inviteStaff', { body: { name, phone, role, branchId } }),
    onSuccess: (result) => {
      onDone(result);
      setOpen(false);
      setName('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus />
        {t('invite')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={t('inviteTitle')}
          footer={
            <Button className="w-full" size="lg" disabled={name.trim().length < 2 || phone.replace(/\D/g, '').length < 11} loading={invite.isPending} onClick={() => invite.mutate()}>
              {t('invite')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label={t('name')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('phone')}>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label={t('role')}>
              <div className="flex flex-wrap gap-2">
                {(['senior', 'master', 'manager'] as const).map((value) => (
                  <Chip key={value} active={role === value} onClick={() => setRole(value)}>
                    {tm(`staffRole.${value}`)}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label={t('branch')}>
              <div className="flex flex-wrap gap-2">
                <Chip active={branchId === null} onClick={() => setBranchId(null)}>
                  {t('mainBranch')}
                </Chip>
                {team.branches.map((branch) => (
                  <Chip key={branch.id} active={branchId === branch.id} onClick={() => setBranchId(branch.id)}>
                    {branch.districtName}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemoveStaffButton({ staffId }: { staffId: string }) {
  const t = useTranslations('cabinet.team');
  const onDone = useTeamUpdate(t('removed'));
  const remove = useMutation({
    mutationFn: () => apiCall('removeStaff', { params: { id: staffId } }),
    onSuccess: onDone,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Button variant="ghost" size="icon-sm" className="text-danger" loading={remove.isPending} onClick={() => remove.mutate()} aria-label={t('removed')}>
      <Trash />
    </Button>
  );
}
