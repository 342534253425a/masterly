import { AppError } from '@masterly/platform';

export type Table = 'events' | 'searches';
export type Row = Record<string, unknown>;

export interface DailyPoint {
  date: string;
  impressions: number;
  promoted: number;
  views: number;
  contacts: number;
  leads: number;
}

export interface QueryStat {
  query: string;
  impressions: number;
  views: number;
  leads: number;
}

export interface MasterReport {
  series: DailyPoint[];
  sources: Record<string, number>;
  hours: number[];
  /** Поисковые запросы, по которым показывался профиль: показы и переходы в профиль. */
  queries: QueryStat[];
}

export interface PlatformOverview {
  searches: Array<{ date: string; total: number; zeroResults: number }>;
  leadsByCity: Record<string, number>;
  searchesByService: Record<string, number>;
  leadsByService: Record<string, number>;
  views: number;
  contacts: number;
  leads: number;
}

/** Хранилище аналитики: ClickHouse по HTTP в проде, память — в тестах (та же семантика, что у представлений init.sql). */
export interface Warehouse {
  insert(table: Table, rows: Row[]): Promise<void>;
  masterReport(masterId: string, days: number): Promise<MasterReport>;
  searchGaps(cityId: string, days: number, limit: number): Promise<Array<{ query: string; cityId: string; hits: number }>>;
  platformOverview(days: number): Promise<PlatformOverview>;
  eraseUser(userHash: string): Promise<void>;
}


/** ClickHouse HTTP-интерфейс: JSONEachRow для вставки, параметризованные запросы ({name:Type}) для чтения. */
export class ClickHouseWarehouse implements Warehouse {
  constructor(
    private readonly url: string,
    private readonly database = 'analytics',
    private readonly auth?: { user: string; password: string },
  ) {}

  async insert(table: Table, rows: Row[]): Promise<void> {
    if (rows.length === 0) return;
    await this.request(`INSERT INTO ${this.database}.${table} FORMAT JSONEachRow`, {}, rows.map((row) => JSON.stringify(row)).join('\n'), { date_time_input_format: 'best_effort', async_insert: '1', wait_for_async_insert: '1' });
  }

  async masterReport(masterId: string, days: number): Promise<MasterReport> {
    const params = { master: masterId, days: String(days) };
    const db = this.database;
    const [series, sources, hours, impressions, views] = await Promise.all([
      this.select<DailyPoint>(
        `SELECT toString(day) AS date, sum(impressions) AS impressions, sum(promoted) AS promoted, sum(views) AS views, sum(contacts) AS contacts, sum(leads) AS leads
           FROM ${db}.master_daily WHERE master_id = {master:String} AND day >= today() - {days:UInt32} GROUP BY day ORDER BY day`,
        params,
      ),
      this.select<{ source: string; c: number }>(
        `SELECT source, count() AS c FROM ${db}.events WHERE name = 'profile_view' AND master_id = {master:String} AND event_date >= today() - {days:UInt32} GROUP BY source`,
        params,
      ),
      this.select<{ h: number; c: number }>(
        `SELECT toHour(ts) AS h, count() AS c FROM ${db}.events WHERE name = 'profile_view' AND master_id = {master:String} AND event_date >= today() - {days:UInt32} GROUP BY h`,
        params,
      ),
      this.select<{ query: string; impressions: number }>(
        `SELECT query, count() AS impressions FROM ${db}.searches ARRAY JOIN shown_ids AS master_id
          WHERE master_id = {master:String} AND ts >= now() - toIntervalDay({days:UInt32}) AND query != '' GROUP BY query ORDER BY impressions DESC LIMIT 20`,
        params,
      ),
      this.select<{ query: string; views: number }>(
        `SELECT s.query AS query, count() AS views FROM ${db}.events AS e INNER JOIN ${db}.searches AS s ON s.search_id = e.search_id
          WHERE e.name = 'profile_view' AND e.master_id = {master:String} AND e.event_date >= today() - {days:UInt32} GROUP BY query`,
        params,
      ),
    ]);
    return {
      // ClickHouse отдаёт UInt64 строками в JSON — приводим к числам
      series: series.map((row) => ({ date: row.date, impressions: Number(row.impressions), promoted: Number(row.promoted), views: Number(row.views), contacts: Number(row.contacts), leads: Number(row.leads) })),
      sources: Object.fromEntries(sources.map((row) => [row.source || 'direct', Number(row.c)])),
      hours: Array.from({ length: 24 }, (_, hour) => Number(hours.find((row) => Number(row.h) === hour)?.c ?? 0)),
      queries: impressions.map((row) => ({ query: row.query, impressions: Number(row.impressions), views: Number(views.find((item) => item.query === row.query)?.views ?? 0), leads: 0 })),
    };
  }

  async searchGaps(cityId: string, days: number, limit: number) {
    const rows = await this.select<{ query: string; city_id: string; hits: number }>(
      `SELECT query, city_id, sum(hits) AS hits FROM ${this.database}.search_gaps_daily
        WHERE day >= today() - {days:UInt32} AND ({city:String} = '' OR city_id = {city:String})
        GROUP BY query, city_id ORDER BY hits DESC LIMIT {limit:UInt32}`,
      { city: cityId, days: String(days), limit: String(limit) },
    );
    return rows.map((row) => ({ query: row.query, cityId: row.city_id, hits: Number(row.hits) }));
  }

  async platformOverview(days: number): Promise<PlatformOverview> {
    const params = { days: String(days) };
    const db = this.database;
    const [searches, leadsByCity, searchesByService, leadsByService, totals] = await Promise.all([
      this.select<{ date: string; total: number; zero: number }>(
        `SELECT toString(toDate(ts)) AS date, count() AS total, countIf(results_count = 0) AS zero FROM ${db}.searches WHERE ts >= now() - toIntervalDay({days:UInt32}) GROUP BY date ORDER BY date`,
        params,
      ),
      this.select<{ key: string; n: number }>(`SELECT city_id AS key, uniqExact(props['lead']) AS n FROM ${db}.events WHERE name = 'lead_created' AND event_date >= today() - {days:UInt32} GROUP BY key`, params),
      this.select<{ key: string; n: number }>(`SELECT service_id AS key, count() AS n FROM ${db}.searches WHERE ts >= now() - toIntervalDay({days:UInt32}) AND service_id != '' GROUP BY key`, params),
      this.select<{ key: string; n: number }>(`SELECT service_id AS key, uniqExact(props['lead']) AS n FROM ${db}.events WHERE name = 'lead_created' AND event_date >= today() - {days:UInt32} GROUP BY key`, params),
      this.select<{ views: number; contacts: number; leads: number }>(
        `SELECT countIf(name = 'profile_view') AS views, countIf(name = 'contact_reveal') AS contacts, uniqExactIf(props['lead'], name = 'lead_created') AS leads
           FROM ${db}.events WHERE event_date >= today() - {days:UInt32}`,
        params,
      ),
    ]);
    const map = (rows: Array<{ key: string; n: number }>) => Object.fromEntries(rows.map((row) => [row.key, Number(row.n)]));
    return {
      searches: searches.map((row) => ({ date: row.date, total: Number(row.total), zeroResults: Number(row.zero) })),
      leadsByCity: map(leadsByCity),
      searchesByService: map(searchesByService),
      leadsByService: map(leadsByService),
      views: Number(totals[0]?.views ?? 0),
      contacts: Number(totals[0]?.contacts ?? 0),
      leads: Number(totals[0]?.leads ?? 0),
    };
  }

  /** Удаление по псевдониму — мутация ClickHouse; в проде запросы копятся и выполняются пакетом раз в сутки. */
  async eraseUser(userHash: string): Promise<void> {
    for (const table of ['events', 'searches']) await this.request(`ALTER TABLE ${this.database}.${table} DELETE WHERE user_hash = {hash:String}`, { hash: userHash });
  }

  private async select<T>(sql: string, params: Record<string, string>): Promise<T[]> {
    const body = await this.request(`${sql} FORMAT JSON`, params);
    return (JSON.parse(body) as { data: T[] }).data;
  }

  private async request(query: string, params: Record<string, string>, body?: string, settings: Record<string, string> = {}): Promise<string> {
    const url = new URL(this.url);
    url.searchParams.set('query', query);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(`param_${name}`, value);
    for (const [name, value] of Object.entries(settings)) url.searchParams.set(name, value);
    const headers: Record<string, string> = {};
    if (this.auth) Object.assign(headers, { 'X-ClickHouse-User': this.auth.user, 'X-ClickHouse-Key': this.auth.password });
    const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) }).catch((error: unknown) => {
      throw new AppError('UNAVAILABLE', `ClickHouse недоступен: ${(error as Error).message}`, 'warehouse_unavailable');
    });
    const text = await response.text();
    if (!response.ok) throw new AppError(response.status >= 500 ? 'UNAVAILABLE' : 'INTERNAL', `ClickHouse ${response.status}: ${text.slice(0, 200)}`, 'warehouse_error');
    return text;
  }
}

/** Та же семантика, что у материализованных представлений ClickHouse (init.sql), — для тестов. */
export class MemoryWarehouse implements Warehouse {
  readonly tables: Record<Table, Row[]> = { events: [], searches: [] };

  async insert(table: Table, rows: Row[]): Promise<void> {
    this.tables[table].push(...rows);
  }

  async masterReport(masterId: string, days: number): Promise<MasterReport> {
    const since = Date.now() - days * 86_400_000;
    const points = new Map<string, DailyPoint>();
    const point = (ts: unknown) => {
      const date = String(ts).slice(0, 10);
      const existing = points.get(date) ?? { date, impressions: 0, promoted: 0, views: 0, contacts: 0, leads: 0 };
      points.set(date, existing);
      return existing;
    };
    const impressions = new Map<string, number>();
    for (const row of this.tables.searches) {
      if (Date.parse(String(row.ts)) < since) continue;
      for (const id of row.shown_ids as string[]) {
        if (id !== masterId) continue;
        point(row.ts).impressions++;
        if ((row.promoted_ids as string[]).includes(id)) point(row.ts).promoted++;
        if (row.query) impressions.set(String(row.query), (impressions.get(String(row.query)) ?? 0) + 1);
      }
    }
    const sources: Record<string, number> = {};
    const hours = Array.from({ length: 24 }, () => 0);
    const views = new Map<string, number>();
    for (const row of this.tables.events) {
      if (row.master_id !== masterId || Date.parse(String(row.ts)) < since) continue;
      const target = point(row.ts);
      if (row.name === 'profile_view') {
        target.views++;
        sources[String(row.source || 'direct')] = (sources[String(row.source || 'direct')] ?? 0) + 1;
        hours[new Date(String(row.ts)).getUTCHours()]!++;
        const query = this.tables.searches.find((search) => search.search_id && search.search_id === row.search_id)?.query;
        if (query) views.set(String(query), (views.get(String(query)) ?? 0) + 1);
      }
      if (row.name === 'contact_reveal') target.contacts++;
      if (row.name === 'lead_created') target.leads++;
    }
    return {
      series: [...points.values()].sort((a, b) => a.date.localeCompare(b.date)),
      sources,
      hours,
      queries: [...impressions].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([query, count]) => ({ query, impressions: count, views: views.get(query) ?? 0, leads: 0 })),
    };
  }

  async searchGaps(cityId: string, _days: number, limit: number) {
    const gaps = new Map<string, { query: string; cityId: string; hits: number }>();
    for (const row of this.tables.searches) {
      if (Number(row.results_count) !== 0 || !row.query || (cityId && row.city_id !== cityId)) continue;
      const query = String(row.query).toLowerCase();
      const key = `${row.city_id}:${query}`;
      gaps.set(key, { query, cityId: String(row.city_id), hits: (gaps.get(key)?.hits ?? 0) + 1 });
    }
    return [...gaps.values()].sort((a, b) => b.hits - a.hits).slice(0, limit);
  }

  async platformOverview(days: number): Promise<PlatformOverview> {
    const since = Date.now() - days * 86_400_000;
    const searches = this.tables.searches.filter((row) => Date.parse(String(row.ts)) >= since);
    const events = this.tables.events.filter((row) => Date.parse(String(row.ts)) >= since);
    const byDay = new Map<string, { date: string; total: number; zeroResults: number }>();
    for (const row of searches) {
      const date = String(row.ts).slice(0, 10);
      const day = byDay.get(date) ?? { date, total: 0, zeroResults: 0 };
      day.total++;
      if (Number(row.results_count) === 0) day.zeroResults++;
      byDay.set(date, day);
    }
    const distinctLeads = (key: 'city_id' | 'service_id') => {
      const sets = new Map<string, Set<string>>();
      for (const row of events) {
        if (row.name !== 'lead_created') continue;
        const group = String(row[key] ?? '');
        sets.set(group, (sets.get(group) ?? new Set()).add(String((row.props as Record<string, string>)?.lead ?? row.master_id)));
      }
      return Object.fromEntries([...sets].map(([group, set]) => [group, set.size]));
    };
    const searchesByService: Record<string, number> = {};
    for (const row of searches) if (row.service_id) searchesByService[String(row.service_id)] = (searchesByService[String(row.service_id)] ?? 0) + 1;
    const leads = new Set(events.filter((row) => row.name === 'lead_created').map((row) => String((row.props as Record<string, string>)?.lead ?? row.master_id)));
    return {
      searches: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      leadsByCity: distinctLeads('city_id'),
      searchesByService,
      leadsByService: distinctLeads('service_id'),
      views: events.filter((row) => row.name === 'profile_view').length,
      contacts: events.filter((row) => row.name === 'contact_reveal').length,
      leads: leads.size,
    };
  }

  async eraseUser(userHash: string): Promise<void> {
    for (const table of ['events', 'searches'] as const) this.tables[table] = this.tables[table].filter((row) => row.user_hash !== userHash);
  }
}
