import type { ServiceRead } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { servicesFixture } from './fixtures/services';

export async function fetchServices(): Promise<ServiceRead[]> {
  if (shouldUseFixtures()) {
    // Kopia, nie referencja: picker sortuje i filtruje opcje, a `servicesFixture` jest
    // współdzielony przez cały proces — mutacja w miejscu zatrułaby kolejne odczyty.
    return [...servicesFixture];
  }

  return getJson<ServiceRead[]>('/api/v1/services');
}
