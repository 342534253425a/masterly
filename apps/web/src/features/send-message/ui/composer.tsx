'use client';

import type { Message, MessagesPage } from '@masterly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type KeyboardEvent } from 'react';
import { conversationQueries } from '@/entities/conversation';
import { apiCall, errorMessage } from '@/shared/api';
import { track } from '@/shared/lib';
import { Button, toast } from '@/shared/ui';

const QUICK_REPLIES = ['Здравствуйте! Когда можно подъехать?', 'Сколько займёт ремонт?', 'Есть ли оригинальная запчасть?'];

/**
 * Отправка с оптимистичным UI и ключом идемпотентности (clientId):
 * сообщение появляется сразу, повтор при плохой сети не создаёт дубль.
 */
export function Composer({ conversationId, showQuickReplies }: { conversationId: string; showQuickReplies?: boolean }) {
  const t = useTranslations('messages');
  const [text, setText] = useState('');
  const queryClient = useQueryClient();
  const key = conversationQueries.messages(conversationId).queryKey;

  const send = useMutation({
    mutationFn: (body: { text: string; clientId: string }) => apiCall('sendMessage', { params: { id: conversationId }, body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MessagesPage>(key);
      const optimistic: Message = { id: body.clientId, conversationId, clientId: body.clientId, fromMe: true, kind: 'text', text: body.text, createdAt: new Date().toISOString(), status: 'sent' };
      queryClient.setQueryData<MessagesPage>(key, (old) => (old ? { ...old, items: [...old.items, optimistic] } : old));
      return { previous };
    },
    onError: (error, _body, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast.error(errorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: conversationQueries.list().queryKey });
    },
  });

  const submit = (value = text) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    send.mutate({ text: trimmed, clientId: crypto.randomUUID() });
    setText('');
    track('message_sent', {});
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-line p-3 sm:p-4">
      {showQuickReplies ? (
        <div className="scrollbar-none mb-2 flex gap-2 overflow-x-auto">
          {QUICK_REPLIES.map((reply) => (
            <button key={reply} type="button" onClick={() => submit(reply)} className="shrink-0 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-fg">
              {reply}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface-2/60 p-1.5 pl-3.5 focus-within:border-accent/50">
        <textarea
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] outline-none placeholder:text-subtle"
        />
        <Button size="icon" onClick={() => submit()} disabled={!text.trim()} aria-label={t('send')}>
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}
