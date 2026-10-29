import { handlers } from '@masterly/mock-api';
import type { Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { CityProvider } from '../src/entities/city';
import messages from '../src/shared/i18n/messages/ru.json';
import { Toaster, TooltipProvider } from '../src/shared/ui';
import '../src/app/styles/globals.css';

// Те же MSW-хендлеры, что обслуживают демо-режим приложения: истории работают с «живыми» данными
const preview: Preview = {
  loaders: [mswLoader()],
  parameters: {
    msw: handlers,
    layout: 'centered',
    backgrounds: { disable: true },
    a11y: { test: 'error' },
    nextjs: { appDirectory: true },
  },
  globalTypes: {
    theme: {
      description: 'Тема',
      toolbar: { title: 'Тема', icon: 'contrast', items: ['dark', 'light'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [
    (Story, context) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return (
        <ThemeProvider attribute="class" forcedTheme={context.globals.theme as string}>
          <NextIntlClientProvider locale="ru" messages={messages} timeZone="Europe/Moscow">
            <QueryClientProvider client={queryClient}>
              <CityProvider initialCity="moskva">
                <TooltipProvider>
                  <div className="min-w-[320px] bg-bg p-6 text-fg">
                    <Story />
                  </div>
                  <Toaster />
                </TooltipProvider>
              </CityProvider>
            </QueryClientProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      );
    },
  ],
};

export default preview;
