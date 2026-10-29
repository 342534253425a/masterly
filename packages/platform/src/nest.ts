import { Global, Module, type DynamicModule, type Provider } from '@nestjs/common';
import type { Logger } from 'pino';
import type { KeyValueStore } from './cache/kv.js';
import type { BaseConfig } from './config.js';
import type { Db } from './db/db.js';
import type { EventBus } from './events/bus.js';
import type { PubSub } from './realtime/pubsub.js';

/** Токены DI ресурсов платформы. */
export const CONFIG = 'platform:config';
export const LOGGER = 'platform:logger';
export const DB = 'platform:db';
export const EVENT_BUS = 'platform:event-bus';
export const KV = 'platform:kv';
export const PUBSUB = 'platform:pubsub';

export interface PlatformResources {
  config: BaseConfig;
  logger: Logger;
  db?: Db;
  bus?: EventBus;
  kv?: KeyValueStore;
  pubsub?: PubSub;
}

/** Глобальный модуль: ресурсы создаются в bootstrap (или в тестах — PGlite, шина и хранилище в памяти). */
@Global()
@Module({})
export class PlatformModule {
  static forRoot(resources: PlatformResources): DynamicModule {
    const providers: Provider[] = [
      { provide: CONFIG, useValue: resources.config },
      { provide: LOGGER, useValue: resources.logger },
    ];
    if (resources.db) providers.push({ provide: DB, useValue: resources.db });
    if (resources.bus) providers.push({ provide: EVENT_BUS, useValue: resources.bus });
    if (resources.kv) providers.push({ provide: KV, useValue: resources.kv });
    if (resources.pubsub) providers.push({ provide: PUBSUB, useValue: resources.pubsub });
    return { module: PlatformModule, global: true, providers, exports: providers.map((provider) => (provider as { provide: string }).provide) };
  }
}
