import { useTranslations } from 'next-intl';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { Container, Logo } from '@/shared/ui';

export function SiteFooter() {
  const t = useTranslations();
  const year = new Date().getFullYear();
  const columns = [
    {
      title: t('footer.product'),
      links: [
        { href: routes.search(), label: t('nav.search') },
        { href: routes.compare(), label: t('compare.title') },
        { href: routes.landing('moskva', 'zamena-displeya'), label: 'Замена дисплея в Москве' },
        { href: routes.landing('sankt-peterburg', 'zamena-akkumulyatora'), label: 'Аккумулятор в Петербурге' },
        { href: routes.landing('krasnodar'), label: 'Ремонт в Краснодаре' },
      ],
    },
    {
      title: t('footer.company'),
      links: [
        { href: routes.forMasters(), label: t('nav.forMasters') },
        { href: routes.help(), label: t('nav.help') },
        { href: routes.cabinet.root(), label: t('nav.cabinet') },
      ],
    },
    {
      title: t('footer.legal'),
      links: [
        { href: routes.help(), label: t('footer.privacy') },
        { href: routes.help(), label: t('footer.terms') },
      ],
    },
  ];
  return (
    <footer className="mt-16 border-t border-line">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">{t('footer.tagline')}</p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-subtle">{column.title}</h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-muted transition-colors hover:text-fg">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <Container className="border-t border-line py-5 text-xs text-subtle">{t('footer.rights', { year })}</Container>
    </footer>
  );
}
