import { leasesFixture } from '@/api/fixtures/leases';
import type { DecisionRequest, LeaseOverview, LeaseStatus, Recommendation } from '@/types/api';

/**
 * Stan symulacji dla testów: zegar, offset, dzierżawy i zapisane żądania.
 *
 * To WYŁĄCZNIE infrastruktura testowa — emuluje backend (`LeaseService` + `TimeProvider`),
 * bo frontend nie liczy statusów ani liczby pozostałych dni. Kod aplikacji nie może
 * importować tego modułu.
 */

export const BASE_SIMULATED_NOW = '2026-10-03T00:00:00Z';
export const WARNING_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
const DEFAULT_LEASE_DAYS = 30;

let simulatedNow = BASE_SIMULATED_NOW;
let offsetDays = 0;
let lastTimeTravelRequest: { days: number } | null = null;
let demoResetCount = 0;
let lastDecisionRequest: { lease_id: number; request: DecisionRequest } | null = null;
let leases: LeaseOverview[] = cloneLeases();

function cloneLeases(): LeaseOverview[] {
  return leasesFixture.map((lease) => ({
    ...lease,
    user: { ...lease.user, team: lease.user.team === null ? null : { ...lease.user.team } },
    repository: { ...lease.repository },
  }));
}

export function getSimulatedNow(): string {
  return simulatedNow;
}

export function getSimulatedOffsetDays(): number {
  return offsetDays;
}

export function resetMswState(): void {
  simulatedNow = BASE_SIMULATED_NOW;
  offsetDays = 0;
  lastTimeTravelRequest = null;
  demoResetCount = 0;
  lastDecisionRequest = null;
  leases = cloneLeases();
}

export function advanceSimulatedClock(days: number): void {
  simulatedNow = new Date(Date.parse(simulatedNow) + days * DAY_MS).toISOString();
  offsetDays += days;
  lastTimeTravelRequest = { days };
}

export function getLastTimeTravelRequest(): { days: number } | null {
  return lastTimeTravelRequest;
}

export function recordDemoReset(): void {
  demoResetCount += 1;
  simulatedNow = BASE_SIMULATED_NOW;
  offsetDays = 0;
  lastTimeTravelRequest = null;
  leases = cloneLeases();
}

export function getDemoResetCount(): number {
  return demoResetCount;
}

export function recordDecision(lease_id: number, request: DecisionRequest): void {
  lastDecisionRequest = { lease_id, request };
}

export function getLastDecisionRequest(): { lease_id: number; request: DecisionRequest } | null {
  return lastDecisionRequest;
}

/** Dzierżawy widziane przez API: z polami, które w produkcji liczy backend. */
export function getLeases(): LeaseOverview[] {
  return leases.map((lease) => withComputedFields(lease, simulatedNow));
}

/** Stosuje decyzję administratora tak, jak zrobiłby to backend. Zwraca `null`, gdy brak dzierżawy. */
export function applyDecision(lease_id: number, request: DecisionRequest): LeaseOverview | null {
  const index = leases.findIndex((lease) => lease.id === lease_id);
  if (index === -1) {
    return null;
  }

  const lease = leases[index];
  const base = lease.expires_at === null ? simulatedNow : lease.expires_at;

  if (request.action === 'EXTEND') {
    const days = extensionDays(request, base);
    leases[index] = {
      ...lease,
      is_active: true,
      expires_at: new Date(Date.parse(base) + days * DAY_MS).toISOString(),
    };
  } else if (request.action === 'DOWNSCOPE') {
    leases[index] = {
      ...lease,
      current_role: lease.current_role === 'admin' ? 'write' : 'read',
    };
  } else {
    leases[index] = { ...lease, is_active: false };
  }

  return withComputedFields(leases[index], simulatedNow);
}

function extensionDays(request: DecisionRequest, base: string): number {
  const extension = request.extension ?? {};

  if (typeof extension.preset_days === 'number') {
    return extension.preset_days;
  }
  if (typeof extension.custom_days === 'number') {
    return extension.custom_days;
  }
  if (typeof extension.multiplier === 'number') {
    return Math.round(DEFAULT_LEASE_DAYS * extension.multiplier);
  }
  if (typeof extension.until_date === 'string') {
    return Math.max(1, Math.ceil((Date.parse(extension.until_date) - Date.parse(base)) / DAY_MS));
  }

  return DEFAULT_LEASE_DAYS;
}

/**
 * Uzupełnia pola liczone przez backend (`status`, `days_remaining`, `recommendation`)
 * na podstawie `expires_at` i bieżącego czasu symulowanego.
 */
export function withComputedFields(lease: LeaseOverview, now: string): LeaseOverview {
  if (lease.expires_at === null) {
    return { ...lease, status: 'ACTIVE', days_remaining: null };
  }

  const diff = Date.parse(lease.expires_at) - Date.parse(now);
  const status: LeaseStatus =
    diff <= 0 ? 'EXPIRED' : diff <= WARNING_WINDOW_DAYS * DAY_MS ? 'WARNING' : 'ACTIVE';
  const recommendation: Recommendation =
    status === 'EXPIRED' ? 'REVOKE' : status === 'WARNING' ? 'DOWNSCOPE' : lease.recommendation;

  return { ...lease, status, days_remaining: Math.ceil(diff / DAY_MS), recommendation };
}
