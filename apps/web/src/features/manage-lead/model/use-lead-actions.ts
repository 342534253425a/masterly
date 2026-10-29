'use client';

import type { Lead } from '@masterly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { leadQueries } from '@/entities/lead';
import { apiCall, errorMessage } from '@/shared/api';
import { track } from '@/shared/lib';
import { toast } from '@/shared/ui';

export function useLeadActions(leadId: string) {
  const queryClient = useQueryClient();
  const onSuccess = (lead: Lead) => {
    queryClient.setQueryData(leadQueries.detail(leadId).queryKey, lead);
    void queryClient.invalidateQueries({ queryKey: leadQueries.list().queryKey });
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));

  return {
    accept: useMutation({
      mutationFn: (responseId: string) => apiCall('acceptResponse', { params: { id: leadId, responseId } }),
      onSuccess: (lead) => {
        onSuccess(lead);
        track('lead_accept', { leadId });
      },
      onError,
    }),
    cancel: useMutation({ mutationFn: () => apiCall('cancelLead', { params: { id: leadId } }), onSuccess, onError }),
    complete: useMutation({ mutationFn: () => apiCall('completeLead', { params: { id: leadId } }), onSuccess, onError }),
  };
}
