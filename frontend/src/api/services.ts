import type { ServiceRead } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { servicesFixture } from './fixtures/services';

export async function fetchServices(): Promise<ServiceRead[]> {
  if (shouldUseFixtures()) {
    return servicesFixture;
  }

  return getJson<ServiceRead[]>('/api/v1/services');
}
