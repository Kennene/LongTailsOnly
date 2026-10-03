# Zadanie 12: Szkielet frontendu, kontrakt API, klient i pasek czasu — plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development` (zalecany) lub `superpowers:executing-plans`. Kroki używają checkboxów (`- [ ]`).

**Cel:** Działająca aplikacja Vite + React 19 (React Compiler) + TypeScript + Tailwind + shadcn/ui z typami kontraktu API, typowanym klientem, wspólnymi utilami, kontekstem symulacji i komponentem `TimeTravelBar`.

**Architektura:** Kontrakt z ADR 0006 §7 odwzorowany w `src/types/api.ts`. Klient `src/lib/apiClient.ts` eksportuje po jednej funkcji na endpoint, a testy komponentów mockują go przez `vi.mock("@/lib/apiClient")`, więc frontend **nie czeka na backend**. `SimulationContext` trzyma zegar i `refreshKey`, który rośnie po każdym skoku w czasie; widoki pobierają dane przez `useApiResource(loader, refreshKey)`. Wspólne fixture'y DTO są w `src/test/fixtures.ts`. To zadanie **scalamy do `main` jako pierwsze z frontendu** — od niego zależą Zadania 13–18.

**Stack:** Node ≥ 20, Vite, React 19, `babel-plugin-react-compiler`, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui, Vitest, Testing Library, jsdom.

**Spec:** ADR 0001; ADR 0006 §7, §9; `CODING_STANDARDS.md` §1, §3; plan główny — Zadanie 12.

**Branch:** `feat/task-12-frontend-skeleton` · **Zależności:** brak (tylko ADR 0006) · **Odblokowuje:** 13–18

## Ograniczenia globalne

- Funkcje i komponenty jako `export function Nazwa(props: Typ): React.JSX.Element` z jawnymi typami (`CODING_STANDARDS.md` §1.4).
- Bez ręcznego `useMemo`/`useCallback` (React Compiler).
- Formatowanie dat i statusów wyłącznie w `src/lib/dateTime.ts` i `src/lib/statusBadges.ts` (DRY).
- Pliki ≤ 300 linii. UI po polsku, ciemny motyw.

## Review Focus

- **Błąd 422 FastAPI:** `detail` jest tablicą obiektów, nie stringiem — klient musi zbudować czytelny komunikat → test `apiClient > formats validation errors`.
- **Błąd 403 (ostatni admin):** komunikat z `detail` trafia do UI → test `apiClient > throws ApiError with detail`.
- **Wygasła dzierżawa:** `formatDaysRemaining(-4)` → „wygasła 4 dni temu”, `null` → „—” → testy `dateTime`.
- **Brak backendu w dev:** `getClock` odrzucony → pasek pokazuje „Brak połączenia z API” zamiast się wysypać → test `TimeTravelBar > shows connection error`.
- **Szybkie podwójne kliknięcie skoku:** przycisk zablokowany podczas żądania → test `TimeTravelBar > disables buttons while travelling`.

---

### Krok 1: Projekt Vite i narzędzia

**Pliki:**
- Utwórz: `frontend/` (szablon Vite `react-ts`), `frontend/vite.config.ts`, `frontend/src/test/setup.ts`
- Zmień: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/index.html`, `frontend/src/index.css`

- [ ] **1.1: Wygeneruj projekt i zależności** (z katalogu głównego repo):

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install tailwindcss @tailwindcss/vite
npm install -D babel-plugin-react-compiler vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/node
```

Sprawdź `package.json`: `react` i `react-dom` muszą być w wersji `^19`.

- [ ] **1.2: Zastąp `frontend/vite.config.ts`:**

```ts
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react({ babel: { plugins: ["babel-plugin-react-compiler"] } }), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { proxy: { "/api": "http://localhost:8000" } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"] },
});
```

Jeśli zainstalowana wersja `@vitejs/plugin-react` nie przyjmuje opcji `babel`, sprawdź aktualną instrukcję integracji w dokumentacji React Compiler (sekcja Vite) i zastosuj zalecany wariant.

- [ ] **1.3: Aliasy i typy testów.** W `tsconfig.json` i `tsconfig.app.json` dodaj do `compilerOptions`:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

W `tsconfig.app.json` dodaj też `"types": ["vitest/globals", "@testing-library/jest-dom"]`.

- [ ] **1.4: Setup testów** `frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **1.5: Skrypty.** W `package.json` ustaw `"test": "vitest"` (zostaw `dev`, `build`, `lint` z szablonu).

- [ ] **1.6: Tailwind i ciemny motyw.** Zastąp `src/index.css` linią `@import "tailwindcss";`, w `index.html` ustaw `<html lang="pl" class="dark">` oraz `<title>Lease Governor</title>`. Usuń `src/App.css` i przykładowe assety szablonu.

- [ ] **1.7: shadcn/ui.**

```bash
npx shadcn@latest init
npx shadcn@latest add button card badge table dialog input textarea label
```

Przy `init` wybierz kolor bazowy *Neutral* i zmienne CSS. Sprawdź, że powstały `src/lib/utils.ts` (`cn()`) i `src/components/ui/*`.

- [ ] **1.8: Weryfikacja narzędzi.** `npm run build` → kod wyjścia 0; `npx vitest run` → „No test files found” (kod wyjścia 1 jest tu oczekiwany).

- [ ] **1.9: Commit.** `git add frontend && git commit -m "chore(frontend): scaffold Vite React 19 app with Tailwind, shadcn/ui and Vitest"`

---

### Krok 2: Typy kontraktu i fixture'y

**Pliki:**
- Utwórz: `frontend/src/types/api.ts`, `frontend/src/test/fixtures.ts`

**Interfejsy:**
- Produkuje: wszystkie typy z ADR 0006 §7 oraz fabryki `makeUser`, `makeRepo`, `makeLease`, `makeAppeal`, `makeBaseline`, `makeAudit`, `makeUserView`, `CLOCK` (używane w testach Zadań 13–19).

- [ ] **2.1: Dodaj** `frontend/src/types/api.ts`:

```ts
// Lustro backend/app/schemas/api.py — kontrakt z ADR 0006 §7.
export type Team = "DEV" | "QA";
export type Permission = "admin" | "write" | "read";
export type ActionType = "PushEvent" | "PullRequestReviewEvent" | "IssueCommentEvent";
export type LeaseStatus = "ACTIVE" | "WARNING" | "EXPIRED" | "PERMANENT" | "REVOKED";
export type Recommendation = "KEEP" | "DOWNSCOPE" | "REVOKE";
export type AppealStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ActorType = "ADMIN" | "USER" | "SYSTEM";
export type DecisionAction = "EXTEND" | "DOWNSCOPE" | "REVOKE" | "REJECT";
export type EnforcementMode = "warning" | "auto";
export type AuditAction =
  | "LEASE_EXTENDED"
  | "LEASE_DOWNSCOPED"
  | "LEASE_REVOKED"
  | "APPEAL_SUBMITTED"
  | "APPEAL_REJECTED"
  | "BASELINE_APPLIED"
  | "TIME_TRAVEL"
  | "POLICY_CHANGED"
  | "LAST_ADMIN_BLOCKED";

export interface ClockView {
  now: string;
  offset_days: number;
}

export interface PolicyView {
  mode: EnforcementMode;
  lease_days: number;
  warning_days: number;
}

export interface UserRef {
  id: number;
  login: string;
  name: string;
  team: Team | null;
}

export interface RepoRef {
  id: number;
  name: string;
  owner: string;
}

export interface UserView extends UserRef {
  is_admin: boolean;
  active_lease_count: number;
}

export interface LeaseView {
  id: number;
  user: UserRef;
  repo: RepoRef;
  role: Permission;
  granted_at: string;
  expires_at: string | null;
  days_remaining: number | null;
  status: LeaseStatus;
  recommendation: Recommendation;
  last_activity_at: string | null;
  last_activity_type: ActionType | null;
}

export interface DecisionRequest {
  action: DecisionAction;
  multiplier?: number;
  days?: number;
  until?: string;
  justification: string;
}

export interface AppealView {
  id: number;
  lease_id: number;
  user: UserRef;
  repo: RepoRef;
  requested_role: Permission;
  justification: string;
  status: AppealStatus;
  created_at: string;
  resolved_at: string | null;
  lease_status: LeaseStatus;
  days_remaining: number | null;
  recent_activity_count: number;
  previous_appeals: number;
}

export interface BaselineEntryView {
  repo: RepoRef;
  active_members: number;
  proposed_role: Permission;
}

export interface BaselineView {
  team: Team;
  member_count: number;
  window_days: number;
  entries: BaselineEntryView[];
}

export interface AuditLogView {
  id: number;
  timestamp: string;
  actor_type: ActorType;
  actor_id: string | null;
  action: AuditAction;
  target: string;
  details: string | null;
  justification: string | null;
}
```

- [ ] **2.2: Dodaj** `frontend/src/test/fixtures.ts`:

```ts
import type {
  AppealView,
  AuditLogView,
  BaselineView,
  ClockView,
  LeaseView,
  RepoRef,
  UserRef,
  UserView,
} from "@/types/api";

export const CLOCK: ClockView = { now: "2026-10-03T12:00:00Z", offset_days: 0 };

export function makeUser(overrides: Partial<UserRef> = {}): UserRef {
  return { id: 2, login: "kamil-dev", name: "Kamil", team: "DEV", ...overrides };
}

export function makeUserView(overrides: Partial<UserView> = {}): UserView {
  return { ...makeUser(), is_admin: false, active_lease_count: 1, ...overrides };
}

export function makeRepo(overrides: Partial<RepoRef> = {}): RepoRef {
  return { id: 3, name: "payment-gw", owner: "longtails", ...overrides };
}

export function makeLease(overrides: Partial<LeaseView> = {}): LeaseView {
  return {
    id: 1,
    user: makeUser(),
    repo: makeRepo(),
    role: "write",
    granted_at: "2026-09-08T12:00:00Z",
    expires_at: "2026-10-08T12:00:00Z",
    days_remaining: 5,
    status: "WARNING",
    recommendation: "DOWNSCOPE",
    last_activity_at: "2026-09-30T12:00:00Z",
    last_activity_type: "PullRequestReviewEvent",
    ...overrides,
  };
}

export function makeAppeal(overrides: Partial<AppealView> = {}): AppealView {
  return {
    id: 1,
    lease_id: 7,
    user: makeUser({ id: 14, login: "marta-qa", name: "Marta", team: "QA" }),
    repo: makeRepo({ id: 9, name: "qa-automation" }),
    requested_role: "write",
    justification: "Release v2.1 next week",
    status: "PENDING",
    created_at: "2026-10-03T12:00:00Z",
    resolved_at: null,
    lease_status: "WARNING",
    days_remaining: 3,
    recent_activity_count: 1,
    previous_appeals: 0,
    ...overrides,
  };
}

export function makeBaseline(overrides: Partial<BaselineView> = {}): BaselineView {
  return {
    team: "DEV",
    member_count: 12,
    window_days: 30,
    entries: [
      { repo: makeRepo({ id: 1, name: "core-api" }), active_members: 8, proposed_role: "write" },
      { repo: makeRepo({ id: 4, name: "frontend-app" }), active_members: 6, proposed_role: "write" },
    ],
    ...overrides,
  };
}

export function makeAudit(overrides: Partial<AuditLogView> = {}): AuditLogView {
  return {
    id: 1,
    timestamp: "2026-10-03T12:00:00Z",
    actor_type: "ADMIN",
    actor_id: "tomasz-admin",
    action: "LEASE_EXTENDED",
    target: "longtails/qa-automation:marta-qa",
    details: "days=14",
    justification: "Release v2.1",
    ...overrides,
  };
}
```

- [ ] **2.3: Sprawdź typy.** `npx tsc -b` → bez błędów.

- [ ] **2.4: Commit.** `git add frontend/src/types frontend/src/test && git commit -m "feat(frontend): add API contract types and test fixtures"`

---

### Krok 3: Klient API (TDD)

**Pliki:**
- Utwórz: `frontend/src/lib/apiClient.ts`
- Test: `frontend/src/lib/apiClient.test.ts`

**Interfejsy:**
- Produkuje: `ApiError(status, message)`; `getClock`, `timeTravel(days)`, `resetClock()`, `getPolicy`, `setPolicy(mode)`, `getUsers`, `getLeases`, `decideLease(id, decision)`, `getAppeals`, `submitAppeal(leaseId, justification)`, `decideAppeal(id, decision)`, `getBaseline(team)`, `applyBaseline(team, login)`, `getAudit(actorType?)`.

- [ ] **3.1: Napisz testy** `frontend/src/lib/apiClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, decideLease, getAudit, getLeases, timeTravel } from "@/lib/apiClient";
import { makeLease } from "@/test/fixtures";

function mockFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gets leases from API v1", async () => {
    const fetchMock = mockFetch(200, [makeLease()]);

    const leases = await getLeases();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/leases", expect.objectContaining({ method: "GET" }));
    expect(leases[0].user.login).toBe("kamil-dev");
  });

  it("posts JSON bodies", async () => {
    const fetchMock = mockFetch(200, { now: "2026-10-10T12:00:00Z", offset_days: 7 });

    await timeTravel(7);
    await decideLease(5, { action: "EXTEND", days: 14, justification: "Release" });

    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/v1/simulation/time-travel",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ days: 7 }) }),
    ]);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/leases/5/decision");
  });

  it("adds query parameters", async () => {
    const fetchMock = mockFetch(200, []);

    await getAudit("SYSTEM");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/audit?actor_type=SYSTEM");
  });

  it("throws ApiError with detail", async () => {
    mockFetch(403, { detail: "Cannot remove the last administrator of the repository" });

    await expect(decideLease(1, { action: "REVOKE", justification: "x" })).rejects.toEqual(
      new ApiError(403, "Cannot remove the last administrator of the repository"),
    );
  });

  it("formats validation errors", async () => {
    mockFetch(422, { detail: [{ msg: "Value error, EXTEND requires exactly one of: multiplier, days, until" }] });

    await expect(decideLease(1, { action: "EXTEND", justification: "x" })).rejects.toThrow(
      "Value error, EXTEND requires exactly one of: multiplier, days, until",
    );
  });
});
```

- [ ] **3.2: Uruchom — RED.** Z `frontend/`: `npx vitest run src/lib/apiClient.test.ts` → FAIL, moduł nie istnieje.

- [ ] **3.3: Zaimplementuj** `frontend/src/lib/apiClient.ts`:

```ts
import type {
  ActorType,
  AppealView,
  AuditLogView,
  BaselineView,
  ClockView,
  DecisionRequest,
  EnforcementMode,
  LeaseView,
  PolicyView,
  Team,
  UserView,
} from "@/types/api";

const BASE_URL = "/api/v1";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item: { msg?: string }) => item.msg ?? "").join("; ");
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.statusText));
  return payload as T;
}

export function getClock(): Promise<ClockView> {
  return request("GET", "/simulation/clock");
}

export function timeTravel(days: number): Promise<ClockView> {
  return request("POST", "/simulation/time-travel", { days });
}

export function resetClock(): Promise<ClockView> {
  return request("POST", "/simulation/time-travel", { reset: true });
}

export function getPolicy(): Promise<PolicyView> {
  return request("GET", "/policy");
}

export function setPolicy(mode: EnforcementMode): Promise<PolicyView> {
  return request("PUT", "/policy", { mode });
}

export function getUsers(): Promise<UserView[]> {
  return request("GET", "/users");
}

export function getLeases(): Promise<LeaseView[]> {
  return request("GET", "/leases");
}

export function decideLease(leaseId: number, decision: DecisionRequest): Promise<LeaseView> {
  return request("POST", `/leases/${leaseId}/decision`, decision);
}

export function getAppeals(): Promise<AppealView[]> {
  return request("GET", "/appeals");
}

export function submitAppeal(leaseId: number, justification: string): Promise<AppealView> {
  return request("POST", "/appeals", { lease_id: leaseId, justification });
}

export function decideAppeal(appealId: number, decision: DecisionRequest): Promise<AppealView> {
  return request("POST", `/appeals/${appealId}/decision`, decision);
}

export function getBaseline(team: Team): Promise<BaselineView> {
  return request("GET", `/baseline/${team}`);
}

export function applyBaseline(team: Team, login: string): Promise<LeaseView[]> {
  return request("POST", `/baseline/${team}/apply`, { login });
}

export function getAudit(actorType?: ActorType): Promise<AuditLogView[]> {
  return request("GET", actorType ? `/audit?actor_type=${actorType}` : "/audit");
}
```

- [ ] **3.4: Uruchom — GREEN.** `npx vitest run src/lib/apiClient.test.ts` → `5 passed`.

- [ ] **3.5: Commit.** `git add frontend/src/lib/apiClient.ts frontend/src/lib/apiClient.test.ts && git commit -m "feat(frontend): add typed API v1 client"`

---

### Krok 4: `dateTime` i `statusBadges` (TDD)

**Pliki:**
- Utwórz: `frontend/src/lib/dateTime.ts`, `frontend/src/lib/statusBadges.ts`
- Test: `frontend/src/lib/dateTime.test.ts`, `frontend/src/lib/statusBadges.test.ts`

**Interfejsy:**
- Produkuje: `formatDateTime(iso: string | null): string`, `formatDate(iso: string | null): string`, `formatDaysRemaining(days: number | null): string`; `LEASE_STATUS_BADGE`, `getLeaseStatusBadge(status)`, `getRecommendationLabel(recommendation)`, `getRoleLabel(role)`.

- [ ] **4.1: Napisz testy.**

`frontend/src/lib/dateTime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDaysRemaining } from "@/lib/dateTime";

describe("dateTime", () => {
  it("formats ISO timestamps in UTC", () => {
    expect(formatDateTime("2026-10-03T12:00:00Z")).toBe("2026-10-03 12:00");
    expect(formatDate("2026-10-03T12:00:00Z")).toBe("2026-10-03");
    expect(formatDateTime(null)).toBe("—");
  });

  it("describes remaining days", () => {
    expect(formatDaysRemaining(5)).toBe("5 dni");
    expect(formatDaysRemaining(1)).toBe("1 dzień");
    expect(formatDaysRemaining(0)).toBe("wygasa dziś");
    expect(formatDaysRemaining(-4)).toBe("wygasła 4 dni temu");
    expect(formatDaysRemaining(null)).toBe("—");
  });
});
```

`frontend/src/lib/statusBadges.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getLeaseStatusBadge, getRecommendationLabel, getRoleLabel } from "@/lib/statusBadges";

describe("statusBadges", () => {
  it("maps every lease status to a label and color", () => {
    expect(getLeaseStatusBadge("ACTIVE").label).toBe("Aktywna");
    expect(getLeaseStatusBadge("WARNING").className).toContain("amber");
    expect(getLeaseStatusBadge("EXPIRED").className).toContain("red");
    expect(getLeaseStatusBadge("PERMANENT").label).toBe("Stała (admin)");
    expect(getLeaseStatusBadge("REVOKED").label).toBe("Odebrana");
  });

  it("labels recommendations and roles", () => {
    expect(getRecommendationLabel("DOWNSCOPE")).toBe("Deeskaluj do read");
    expect(getRecommendationLabel("KEEP")).toBe("—");
    expect(getRoleLabel("write")).toBe("write (push)");
  });
});
```

- [ ] **4.2: Uruchom — RED.** `npx vitest run src/lib` → FAIL dla nowych modułów.

- [ ] **4.3: Zaimplementuj.**

`frontend/src/lib/dateTime.ts`:

```ts
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `wygasła ${Math.abs(days)} dni temu`;
  if (days === 0) return "wygasa dziś";
  if (days === 1) return "1 dzień";
  return `${days} dni`;
}
```

`frontend/src/lib/statusBadges.ts`:

```ts
import type { LeaseStatus, Permission, Recommendation } from "@/types/api";

export interface BadgeStyle {
  label: string;
  className: string;
}

export const LEASE_STATUS_BADGE: Record<LeaseStatus, BadgeStyle> = {
  ACTIVE: { label: "Aktywna", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  WARNING: { label: "Ostrzeżenie", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  EXPIRED: { label: "Wygasła", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  PERMANENT: { label: "Stała (admin)", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  REVOKED: { label: "Odebrana", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  KEEP: "—",
  DOWNSCOPE: "Deeskaluj do read",
  REVOKE: "Odbierz dostęp",
};

const ROLE_LABEL: Record<Permission, string> = {
  admin: "admin (break-glass)",
  write: "write (push)",
  read: "read (pull)",
};

export function getLeaseStatusBadge(status: LeaseStatus): BadgeStyle {
  return LEASE_STATUS_BADGE[status];
}

export function getRecommendationLabel(recommendation: Recommendation): string {
  return RECOMMENDATION_LABEL[recommendation];
}

export function getRoleLabel(role: Permission): string {
  return ROLE_LABEL[role];
}
```

- [ ] **4.4: Uruchom — GREEN.** `npx vitest run src/lib` → wszystkie PASS.

- [ ] **4.5: Commit.** `git add frontend/src/lib && git commit -m "feat(frontend): add date and status badge utilities"`

---

### Krok 5: Kontekst symulacji, `useApiResource`, `TimeTravelBar` (TDD)

**Pliki:**
- Utwórz: `frontend/src/hooks/SimulationContext.ts`, `frontend/src/hooks/SimulationProvider.tsx`, `frontend/src/hooks/useApiResource.ts`, `frontend/src/components/layout/TimeTravelBar.tsx`, `frontend/src/test/renderWithSimulation.tsx`
- Zmień: `frontend/src/App.tsx`, `frontend/src/main.tsx`
- Test: `frontend/src/components/layout/TimeTravelBar.test.tsx`

**Interfejsy:**
- Produkuje: `SimulationProvider`, `useSimulation(): { clock, connectionError, refreshKey, travel(days), reset(), refresh() }`, `useApiResource<T>(loader, refreshKey): { data, error, loading, reload }`, `TimeTravelBar`, `renderWithSimulation(ui)`.

- [ ] **5.1: Napisz test** `frontend/src/components/layout/TimeTravelBar.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/apiClient";
import { TimeTravelBar } from "@/components/layout/TimeTravelBar";
import { CLOCK } from "@/test/fixtures";
import { renderWithSimulation } from "@/test/renderWithSimulation";

vi.mock("@/lib/apiClient");

describe("TimeTravelBar", () => {
  beforeEach(() => {
    vi.mocked(api.getClock).mockResolvedValue(CLOCK);
    vi.mocked(api.timeTravel).mockResolvedValue({ now: "2026-10-10T12:00:00Z", offset_days: 7 });
    vi.mocked(api.resetClock).mockResolvedValue(CLOCK);
  });

  it("test_time_travel_controller_calls_simulation_api", async () => {
    renderWithSimulation(<TimeTravelBar />);
    expect(await screen.findByText("2026-10-03 12:00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+7 dni" }));
    expect(api.timeTravel).toHaveBeenCalledWith(7);
    expect(await screen.findByText("2026-10-10 12:00")).toBeInTheDocument();
    expect(screen.getByText("+7 dni od teraz")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(api.resetClock).toHaveBeenCalled();
    expect(await screen.findByText("2026-10-03 12:00")).toBeInTheDocument();
  });

  it("disables buttons while travelling", async () => {
    let finish: (value: { now: string; offset_days: number }) => void = () => undefined;
    vi.mocked(api.timeTravel).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderWithSimulation(<TimeTravelBar />);
    await screen.findByText("2026-10-03 12:00");

    await userEvent.click(screen.getByRole("button", { name: "+25 dni" }));

    expect(screen.getByRole("button", { name: "+35 dni" })).toBeDisabled();
    finish({ now: "2026-10-28T12:00:00Z", offset_days: 25 });
    await waitFor(() => expect(screen.getByRole("button", { name: "+35 dni" })).toBeEnabled());
  });

  it("shows connection error", async () => {
    vi.mocked(api.getClock).mockRejectedValue(new Error("Failed to fetch"));

    renderWithSimulation(<TimeTravelBar />);

    expect(await screen.findByText("Brak połączenia z API")).toBeInTheDocument();
  });
});
```

- [ ] **5.2: Uruchom — RED.** `npx vitest run src/components/layout/TimeTravelBar.test.tsx` → FAIL, moduły nie istnieją.

- [ ] **5.3: Zaimplementuj kontekst.**

`frontend/src/hooks/SimulationContext.ts`:

```ts
import { createContext, use } from "react";
import type { ClockView } from "@/types/api";

export interface SimulationValue {
  clock: ClockView | null;
  connectionError: string | null;
  refreshKey: number;
  travel: (days: number) => Promise<void>;
  reset: () => Promise<void>;
  refresh: () => void;
}

export const SimulationContext = createContext<SimulationValue | null>(null);

export function useSimulation(): SimulationValue {
  const value = use(SimulationContext);
  if (!value) throw new Error("useSimulation must be used inside SimulationProvider");
  return value;
}
```

`frontend/src/hooks/SimulationProvider.tsx`:

```tsx
import { type ReactNode, useEffect, useState } from "react";
import { getClock, resetClock, timeTravel } from "@/lib/apiClient";
import { SimulationContext } from "@/hooks/SimulationContext";
import type { ClockView } from "@/types/api";

interface SimulationProviderProps {
  children: ReactNode;
}

export function SimulationProvider({ children }: SimulationProviderProps): React.JSX.Element {
  const [clock, setClock] = useState<ClockView | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getClock()
      .then(setClock)
      .catch(() => setConnectionError("Brak połączenia z API"));
  }, []);

  async function apply(next: Promise<ClockView>): Promise<void> {
    setClock(await next);
    setConnectionError(null);
    setRefreshKey((key) => key + 1);
  }

  const value = {
    clock,
    connectionError,
    refreshKey,
    travel: (days: number) => apply(timeTravel(days)),
    reset: () => apply(resetClock()),
    refresh: () => setRefreshKey((key) => key + 1),
  };
  return <SimulationContext value={value}>{children}</SimulationContext>;
}
```

`frontend/src/hooks/useApiResource.ts`:

```ts
import { useEffect, useState } from "react";

export interface ApiResource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useApiResource<T>(loader: () => Promise<T>, refreshKey: number): ApiResource<T> {
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: null, loading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));
    loader()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (!cancelled) setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => {
      cancelled = true;
    };
    // loader celowo poza zależnościami: odświeżamy wyłącznie po refreshKey / reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, reloadCount]);

  return { ...state, reload: () => setReloadCount((count) => count + 1) };
}
```

`frontend/src/test/renderWithSimulation.tsx`:

```tsx
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { SimulationProvider } from "@/hooks/SimulationProvider";

export function renderWithSimulation(ui: ReactElement): RenderResult {
  return render(<SimulationProvider>{ui}</SimulationProvider>);
}
```

- [ ] **5.4: Zaimplementuj** `frontend/src/components/layout/TimeTravelBar.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSimulation } from "@/hooks/SimulationContext";
import { formatDateTime } from "@/lib/dateTime";

const JUMPS = [7, 25, 35];

export function TimeTravelBar(): React.JSX.Element {
  const { clock, connectionError, travel, reset } = useSimulation();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  if (connectionError) return <span className="text-sm text-red-400">{connectionError}</span>;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col leading-tight">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Czas symulacji</span>
        <span className="font-mono text-sm">{clock ? formatDateTime(clock.now) : "…"}</span>
        {clock && clock.offset_days !== 0 && (
          <span className="text-xs text-amber-400">+{clock.offset_days} dni od teraz</span>
        )}
      </div>
      {JUMPS.map((days) => (
        <Button key={days} size="sm" variant="secondary" disabled={busy} onClick={() => run(() => travel(days))}>
          +{days} dni
        </Button>
      ))}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(reset)}>
        Reset
      </Button>
    </div>
  );
}
```

- [ ] **5.5: Podłącz w aplikacji.** `frontend/src/App.tsx`:

```tsx
import { TimeTravelBar } from "@/components/layout/TimeTravelBar";
import { SimulationProvider } from "@/hooks/SimulationProvider";

export function App(): React.JSX.Element {
  return (
    <SimulationProvider>
      <header className="flex h-14 items-center justify-between border-b px-6">
        <span className="font-semibold">Lease Governor</span>
        <TimeTravelBar />
      </header>
    </SimulationProvider>
  );
}
```

W `main.tsx` zmień import na `import { App } from "./App";` (named export) i zachowaj `import "./index.css";`.

- [ ] **5.6: Uruchom — GREEN.** `npx vitest run` → wszystkie PASS; `npm run build` → kod wyjścia 0; `npm run lint` → bez błędów.

- [ ] **5.7: Commit.** `git add frontend/src && git commit -m "feat(frontend): add simulation context and time travel bar"`

---

### Krok 6: Weryfikacja i szybki merge

- [ ] **6.1:** Z `frontend/`: `npx vitest run && npm run build && npm run lint` → zielone.
- [ ] **6.2:** Jeśli backend z Zadania 11 jest dostępny: `npm run dev` + backend na `:8000` → pasek pokazuje czas i skacze. Jeśli nie — pasek pokazuje „Brak połączenia z API” (to oczekiwane).
- [ ] **6.3:** PR → `main` z prośbą o szybkie review — **od tego PR zależą Zadania 13–18.**
