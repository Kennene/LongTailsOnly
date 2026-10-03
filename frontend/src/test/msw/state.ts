import { leasesFixture } from '@/api/fixtures/leases';
import type { DecisionRequest, LeaseOverview, LeaseStatus, Recommendation } from '@/types/api';

/**
 * Stan symulacji dla testów: zegar, offset, dostępy i zapisane żądania.
 *
 * To WYŁĄCZNIE infrastruktura testowa — emuluje backend (`LeaseService` + `TimeProvider`),
 * bo frontend nie liczy statusów ani liczby pozostałych dni. Kod aplikacji nie może
 * importować tego modułu.
 *
 * `status`, `days_remaining` i `recommendation` w stanie to **snapshot z kotwicy demo**
 * (`shared/fixtures/leases*.json`, ADR 0008) — dokładnie te wartości, które pinują scenariusze
 * UC-2 i UC-4 dla `t0`. Zegar symulowany nie przelicza ich od nowa z `expires_at` (backend
 * liczy `ceil`, a fixture'y są zrzutem z bazy sprzed doby — przeliczenie rozjechałoby `t0`
 * z `uc-02-downscope.json` o dwa dni). Zamiast tego dokładamy do snapshotu przesunięcie zegara:
 * dostęp, który na kotwicy ma 28 dni, po skoku +25 dni ma 3 dni i wchodzi w okno ostrzegawcze.
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

/** Dostępy widziane przez API: snapshot z kotwicy przesunięty o zegar symulowany. */
export function getLeases(): LeaseOverview[] {
  return leases.map((lease) => withComputedFields(lease, offsetDays));
}

/** Stosuje decyzję administratora tak, jak zrobiłby to backend. Zwraca `null`, gdy brak dostępu. */
export function applyDecision(lease_id: number, request: DecisionRequest): LeaseOverview | null {
  const index = leases.findIndex((lease) => lease.id === lease_id);
  if (index === -1) {
    return null;
  }

  const lease = leases[index];
  const base = lease.expires_at === null ? simulatedNow : lease.expires_at;

  if (request.action === 'EXTEND') {
    const days = extensionDays(request, base);
    // Nowy termin przesuwa snapshot o długość przedłużenia; dla stałego dostępu (`null`)
    // snapshot powstaje od zera, a różnicę kotwica→dziś dokładamy przez `offsetDays`.
    const extended =
      lease.days_remaining === null ? days + offsetDays : lease.days_remaining + days;
    leases[index] = {
      ...lease,
      is_active: true,
      expires_at: new Date(Date.parse(base) + days * DAY_MS).toISOString(),
      days_remaining: extended,
    };
  } else if (request.action === 'DOWNSCOPE') {
    leases[index] = {
      ...lease,
      current_role: lease.current_role === 'admin' ? 'write' : 'read',
    };
  } else {
    leases[index] = { ...lease, is_active: false };
  }

  return withComputedFields(leases[index], offsetDays);
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
 * Przesuwa snapshot dostępu o zegar symulowany: `status` wynika z liczby dni, a nie z zegara
 * systemowego, więc panel pokazuje dokładnie to, co pokazałby backend po `time_travel`.
 *
 * Rekomendacja bierze się z aktywności w seedzie (snapshot fixture'u), z jednym wyjątkiem:
 * dzierżawa po terminie to `REVOKE` (patrz `recommendationFor`).
 */
export function withComputedFields(lease: LeaseOverview, elapsedDays: number): LeaseOverview {
  const days: number | null =
    lease.expires_at === null || lease.days_remaining === null
      ? null
      : lease.days_remaining - elapsedDays;
  const status: LeaseStatus = statusFor(lease, days);

  return {
    ...lease,
    status,
    days_remaining: days,
    recommendation: recommendationFor(lease.recommendation, status),
  };
}

/**
 * Rekomendacja dla policzonego statusu — scenariusze są źródłem prawdy, nie snapshot kotwicy.
 *
 * `shared/scenarios/uc-04-time-travel.json` pinuje dla `kamil@core-api` w `t30` status `EXPIRED`
 * **i** rekomendację `REVOKE`, a snapshot kotwicy trzyma tam `KEEP` (fixture'y są zrzutem z bazy
 * sprzed doby, ADR 0008). Dzierżawa po terminie idzie więc na `REVOKE`, a przed terminem
 * rekomendacja zostaje ze snapshotu — to ona pinuje `WARNING`/`DOWNSCOPE` z
 * `shared/scenarios/uc-02-downscope.json`.
 */
function recommendationFor(snapshot: Recommendation, status: LeaseStatus): Recommendation {
  return status === 'EXPIRED' ? 'REVOKE' : snapshot;
}

/**
 * Progi z ADR 0002: `days_remaining <= 0` to termin miniony, okno ostrzegawcze to 7 dni.
 *
 * Reguła silnika 3.1 (`app/domain/lease_rules.py::lease_status`) najpierw rozstrzyga przypadki
 * niezależne od zegara: odebrany dostęp to `REVOKED`, a brak terminu (dostęp admina) to
 * `PERMANENT`. Bez tego kroku symulacja zamieniała stałe dostępy adminów na `ACTIVE`, przez co
 * tryb offline pokazywał inny status niż `GET /api/v1/leases`.
 */
function statusFor(lease: LeaseOverview, days: number | null): LeaseStatus {
  if (!lease.is_active) {
    return 'REVOKED';
  }
  if (days === null) {
    return 'PERMANENT';
  }
  if (days <= 0) {
    return 'EXPIRED';
  }

  return days <= WARNING_WINDOW_DAYS ? 'WARNING' : 'ACTIVE';
}
