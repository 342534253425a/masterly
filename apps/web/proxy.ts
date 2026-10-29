import createMiddleware from 'next-intl/middleware';
import { routing } from './src/shared/i18n/routing';

/** Next.js 16 proxy (бывший middleware): определение локали и префиксы URL (/en, /zh; русский — без префикса). */
export default createMiddleware(routing);

export const config = {
  // API, служебные пути Next.js и файлы с расширением (sitemap.xml, sw.js, иконки) локализовать не нужно
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
