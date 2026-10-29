import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Локализованные Link/router: сохраняют текущий язык при переходах. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
