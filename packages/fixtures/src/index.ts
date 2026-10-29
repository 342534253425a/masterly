import { createProblemClassifier, type ProblemClassifier } from '@masterly/kernel';
import { BRANDS, MODELS } from './devices.js';
import { SERVICES } from './services.js';

export * from './prng.js';
export * from './text.js';
export * from './cities.js';
export * from './services.js';
export * from './devices.js';
export * from './masters.js';
export * from './offers.js';
export * from './reviews.js';
export * from './demo.js';

let classifier: ProblemClassifier | null = null;

/** Классификатор «проблема → услуга + модель» на словаре каталога. */
export function getProblemClassifier(): ProblemClassifier {
  classifier ??= createProblemClassifier({ services: SERVICES, brands: BRANDS, models: MODELS });
  return classifier;
}
