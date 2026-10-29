'use client';

import { useQuery } from '@tanstack/react-query';
import { conversationQueries } from '@/entities/conversation';
import { cabinetQueries } from '@/entities/master';
import { moderationQueries } from '@/entities/moderation';
import { useSession } from '@/entities/session';

/** Счётчики на пунктах меню: непрочитанные сообщения, новые заявки, очередь модерации. */
export function useNavBadges(): Record<'messages' | 'leads' | 'moderation', number> {
  const { isAuthenticated, role } = useSession();
  const conversations = useQuery({ ...conversationQueries.list(), enabled: isAuthenticated });
  const leads = useQuery({ ...cabinetQueries.leads(), enabled: role === 'master' });
  const moderation = useQuery({ ...moderationQueries.queue(undefined, 'pending'), enabled: role === 'admin' });
  return {
    messages: conversations.data?.reduce((sum, c) => sum + c.unread, 0) ?? 0,
    leads: leads.data?.filter((lead) => lead.status === 'new').length ?? 0,
    moderation: moderation.data?.length ?? 0,
  };
}
