import { getTranslations } from 'next-intl/server';
import { Chat } from '@/widgets/chat';
import { requireUser } from '@/shared/server';
import { routes } from '@/shared/config';

export async function generateMessagesMetadata() {
  const t = await getTranslations('messages');
  return { title: t('title'), robots: { index: false } };
}

export async function MessagesPage() {
  await requireUser(routes.messages());
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
      <Chat />
    </div>
  );
}
