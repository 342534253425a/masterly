type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** Единая точка построения URL — без «магических строк» в компонентах. */
export const routes = {
  home: () => '/',
  search: (query?: Query) => withQuery('/search', query),
  master: (slug: string, query?: Query) => withQuery(`/masters/${slug}`, query),
  compare: (query?: Query) => withQuery('/compare', query),
  landing: (city: string, service?: string, model?: string) => `/${[city, service, model].filter(Boolean).join('/')}`,
  orders: () => '/orders',
  order: (id: string) => `/orders/${id}`,
  messages: (conversationId?: string) => withQuery('/messages', { c: conversationId }),
  favorites: () => '/favorites',
  profile: () => '/profile',
  login: (next?: string) => withQuery('/login', { next }),
  forMasters: () => '/for-masters',
  help: () => '/help',
  cabinet: {
    root: () => '/cabinet',
    leads: () => '/cabinet/leads',
    services: () => '/cabinet/services',
    schedule: () => '/cabinet/schedule',
    profile: () => '/cabinet/profile',
    reviews: () => '/cabinet/reviews',
    analytics: () => '/cabinet/analytics',
    team: () => '/cabinet/team',
    billing: () => '/cabinet/billing',
  },
  admin: {
    root: () => '/admin',
    moderation: () => '/admin/moderation',
    duplicates: () => '/admin/duplicates',
    catalog: () => '/admin/catalog',
    users: () => '/admin/users',
    analytics: () => '/admin/analytics',
  },
} as const;
