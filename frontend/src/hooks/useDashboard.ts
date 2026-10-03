import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchDashboard } from '@/api/dashboard';
import { useActiveService } from '@/services/ServicesContext';
import type { DashboardStats } from '@/types/api';

/**
 * Liczniki KPI pulpitu — `GET /api/v1/dashboard/stats` (jedno żądanie, cała dziewiątka pól).
 *
 * Do czasu 4.6B liczniki powstają po stronie frontendu z listy dzierżaw, zegara i odwołań
 * (patrz `api/dashboard.ts`), więc klucz `['dashboard', <id usługi>]` unieważniany po decyzji,
 * odwołaniu, onboardingu i podróży w czasie odświeża całą trójkę odczytów.
 *
 * `enabled: !isPending` — patrz `useLeases`: bez tej bramki odczyt startuje w namespace
 * „brak usługi” (`activeService.id === ''`), czyli po żądaniu na każdą usługę i z mignięciem
 * cudzych danych.
 */
export function useDashboard(): UseQueryResult<DashboardStats> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['dashboard', activeService.id],
    queryFn: fetchDashboard,
    enabled: !isPending && activeService.id !== '',
  });
}
