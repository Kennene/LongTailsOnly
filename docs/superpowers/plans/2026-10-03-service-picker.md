# Service Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a service (integration) picker so the panel can serve multiple providers — GitHub today, others later — where each service declares which views it supports.

**Architecture:** The backend gains a provider registry (`app/ports/service_registry.py`) that each adapter registers into at import time, exposed read-only via `GET /api/v1/services`. The frontend gains a `src/services/` module holding one registry that is the single source of truth for routes, Polish nav labels and icons; a React context holds the active service (persisted in `localStorage`), a declarative route guard redirects unsupported views, and a native `<select>` in the TopBar drives selection.

**Tech Stack:** Python 3.14 + FastAPI + Pydantic v2 + pytest (backend); React 19 + TypeScript + Vite + Tailwind v4 + TanStack Query v5 + react-router-dom v7 + Vitest + MSW 3 (frontend).

**Spec:** `docs/superpowers/specs/2026-10-03-service-picker-design.md`

## Global Constraints

- **No new dependencies.** Icons come from `lucide-react` (mandated by `frontend/DESIGN.md:117`) plus two hand-written SVG brand marks. lucide has **no** `Github`/`Gitlab` icons in v1.51 — verified.
- **All user-visible copy is Polish.** `<html lang="pl">` is static; there is no i18n layer.
- **Hard file limit 300 lines** (`CODING_STANDARDS.md` §1.1), enforced by ESLint as `max-lines: ['error', { max: 300, skipBlankLines: true, skipComments: true }]`. `src/components/ui/**` is exempt.
- **No `useMemo`/`useCallback`** — React Compiler handles memoisation (`CODING_STANDARDS.md` §3). ESLint enforces this.
- **Every function needs an explicit parameter and return type** (`CODING_STANDARDS.md` §1.4).
- **`frontend/src/types/api.ts` is generated — never edit by hand.** Regenerate with the two commands in `backend/README.md`.
- **Chrome text never exceeds `text-sm`; the `text-xs` floor has only two whitelisted exceptions** (`frontend/DESIGN.md:68,70`).
- **Routes stay flat.** Never introduce `/github/leases`; gate the existing paths instead.
- **`--primary` means selection/primary action/focus only** (`frontend/DESIGN.md:52`); never use it for status.
- **Backend commands must run with `UV_CACHE_DIR=<repo>/.uv-cache`** — `uv` cannot reach `~/.cache/uv` in the sandbox and fails with `Failed to initialize cache`.
- **Baseline before this work: frontend 183 tests / 20 files passing; backend 398 passed, 2 failed.** The 2 failures are pre-existing ADR-integrity collisions (spec §2.1) and must stay at exactly 2.

## Review Focus

Inputs and conditions the spec implies but no task's tests naturally exercise. Each has a test placed in the task that owns the code.

1. **`localStorage` containing malformed or non-JSON data** (`"{"`, `"null"`, `"[]"`) — a user whose browser storage was corrupted by another app must get the default service, not a white screen. Owned by Task 4.
2. **Backend catalog returns an empty list** — the panel must render a usable state, not crash on `services[0]` of an empty array. Owned by Task 6.
3. **Backend catalog omits `github` entirely** — the picker must not present `github` as selectable or claim it is active. Owned by Task 6.
4. **`GET /api/v1/services` fails (network down, 500)** — the picker must degrade visibly but keep the app navigable, never throw during render. Owned by Task 6.
5. **`localStorage.setItem` throws** (Safari private mode, quota exceeded) — selection must still work for the session. Owned by Task 4.

---

### Task 1: Backend provider registry

**Files:**
- Create: `backend/app/ports/service_registry.py`
- Create: `backend/tests/ports/test_service_registry.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `ServiceKind` (str enum: `VCS`, `ISSUE_TRACKER`, `CLOUD_IAM`); `ServiceDescriptor` (frozen dataclass: `id: str`, `name: str`, `kind: ServiceKind`, `capabilities: tuple[str, ...]`, `is_available: bool`); `register(descriptor: ServiceDescriptor) -> None`; `all_services() -> tuple[ServiceDescriptor, ...]`. **No test-only helper is exported:** the production surface is exactly these two functions.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ports/test_service_registry.py`. Use an autouse pytest fixture that clears the registry module's `_EXTRA` list **before and after** each test, so `_EXTRA` never leaks between tests while `_BUILTIN` stays intact:

```python
@pytest.fixture(autouse=True)
def _isolated_extras() -> Iterator[None]:
    """`_EXTRA` is module-global; clear it around every test so registrations cannot leak."""
    service_registry._EXTRA.clear()
    yield
    service_registry._EXTRA.clear()
```

**Do not export a `reset_registry()` helper from production code for this.** The registry's public surface is `register` and `all_services` only; a test-only mutator in a production module is a surface production code can call by mistake, and it is unnecessary when the test module can reset the list directly.

```python
def test_register_then_all_services_returns_descriptor() -> None:
    descriptor = ServiceDescriptor(
        id="acme", name="Acme", kind=ServiceKind.VCS,
        capabilities=("dashboard",), is_available=True,
    )
    register(descriptor)
    assert descriptor in all_services()


def test_all_services_is_sorted_by_id() -> None:
    register(ServiceDescriptor("zeta", "Z", ServiceKind.VCS, (), True))
    register(ServiceDescriptor("alpha", "A", ServiceKind.VCS, (), True))
    assert [service.id for service in all_services()] == [
        "alpha", "demo-tracker", "github", "zeta",
    ]


def test_reregistering_an_identical_descriptor_is_a_noop() -> None:
    descriptor = ServiceDescriptor("same", "Same", ServiceKind.VCS, (), True)
    register(descriptor)
    register(descriptor)
    assert [service.id for service in all_services()].count("same") == 1


def test_reregistering_a_builtin_identical_descriptor_is_a_noop() -> None:
    """Task 2's adapters re-register these exact descriptors at import time.

    The idempotency guard must consult the merged catalog, not just `_EXTRA`, or
    importing an adapter raises `ValueError` and the whole app fails to start.
    """
    builtin = next(service for service in all_services() if service.id == "github")
    register(builtin)
    assert [service.id for service in all_services()].count("github") == 1


def test_conflicting_descriptor_for_a_builtin_id_raises() -> None:
    conflicting = ServiceDescriptor("github", "Not GitHub", ServiceKind.CLOUD_IAM, (), False)
    with pytest.raises(ValueError, match="github"):
        register(conflicting)


def test_conflicting_descriptor_for_a_known_id_raises() -> None:
    register(ServiceDescriptor("dup", "One", ServiceKind.VCS, (), True))
    with pytest.raises(ValueError, match="dup"):
        register(ServiceDescriptor("dup", "Two", ServiceKind.VCS, (), True))


def test_extra_registrations_survive_until_the_test_fixture_clears_them() -> None:
    register(ServiceDescriptor("temp", "Temp", ServiceKind.VCS, (), True))
    service_registry._EXTRA.clear()
    ids = {service.id for service in all_services()}
    assert "temp" not in ids
    assert {"github", "demo-tracker"} <= ids
```

Note `test_extra_registrations_survive_until_the_test_fixture_clears_them` deliberately reaches into `_EXTRA`: the point of that test is that the built-ins outlive a clear and the extras do not, which is the durability boundary the module docstring must state honestly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/ports/test_service_registry.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.ports.service_registry'`

- [ ] **Step 3: Implement `backend/app/ports/service_registry.py`**

**Two tiers, and idempotent registration.** `_BUILTIN` is a module-level tuple holding the canonical descriptors for `github` and `demo-tracker`. `register()` appends to a separate module-level `_EXTRA` list. `all_services()` returns `_BUILTIN` merged with `_EXTRA`, de-duplicated by `id` and sorted by `id`. When the same `id` appears in both tiers, **`_EXTRA` wins** (`all_services()` iterates `_BUILTIN` first and lets the later entry overwrite in its de-dup dict) — document that precedence in the docstring. `register()` makes that path unreachable today, so it is a documented invariant rather than live behaviour.

**There is no `reset_registry()`.** Test isolation belongs in the test module, which clears `_EXTRA` directly around each test.

Two consequences you must implement deliberately:

1. **`register()` is idempotent for an identical descriptor.** If the `id` is already known and the descriptor compares equal, it is a silent no-op. If the `id` is known but the descriptor differs, raise `ValueError` naming the `id`. Without this, Task 2's adapter modules — which also call `register(...)` at import time for the very same two services — would raise at import.
2. **Re-registration after a test clears `_EXTRA` must work.** Task 1's test fixture clears `_EXTRA` around every test. Because Python imports a module only once, anything that existed solely in `_EXTRA` would be gone for the rest of the session — which is exactly why the two canonical descriptors live in `_BUILTIN` and why `all_services()` never depends on import order or test order. State that durability boundary honestly in the docstring: the guarantee covers the **built-in** ids, not services that some future adapter registers only into `_EXTRA`.

Use `enum.StrEnum` and `dataclasses.dataclass(frozen=True, slots=True)`.

The module docstring is **English**, matching its neighbours in `backend/app/ports/` (`vcs_provider.py`, `clock.py` are both English; the codebase mixes English module docstrings with Polish comments). It must state: this is the single public API (`register` / `all_services`); it is deliberately a plain in-code list rather than `entry_points` discovery because two adapters do not justify the abstraction (`CODING_STANDARDS.md` §1.5); swapping to discovery touches only this file; registering a conflicting `id` raises rather than silently overwriting.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/ports/test_service_registry.py -q`
Expected: PASS. The count is 8 once all the tests below exist — do not treat a passing count that differs from a number written here as a failure; what matters is that every test in this file passes.

- [ ] **Step 5: Prove the reset does not poison a later test module**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/ports/test_service_registry.py tests/test_health.py -q`
Expected: PASS. If a later-running module ever sees an empty catalog, the `_BUILTIN` tier is not being used — fix that rather than making the tests order-dependent.

- [ ] **Step 6: Commit**

```bash
git add backend/app/ports/service_registry.py backend/tests/ports/test_service_registry.py
git commit -m "feat(backend): provider registry for the plugin architecture"
```

---

### Task 2: Register both adapters

**Files:**
- Create: `backend/app/adapters/demo_service.py`
- Modify: `backend/app/adapters/database_vcs.py`
- Modify: `backend/app/api/v1/deps.py:31-37`
- Test: `backend/tests/adapters/test_adapter_registration.py` (create)

**Interfaces:**
- Consumes: `register`, `ServiceDescriptor`, `ServiceKind`, `all_services` from Task 1.
- Produces: the ids `"github"` and `"demo-tracker"` present in `all_services()` after importing `app.adapters.database_vcs`; `get_vcs_provider(session, clock, service_id: str = "github") -> VCSProvider` raising `ServiceError(404, ...)` for an unknown id.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/adapters/test_adapter_registration.py`:

```python
def test_both_adapters_are_registered() -> None:
    ids = {service.id for service in all_services()}
    assert {"github", "demo-tracker"} <= ids


def test_github_is_available_with_all_six_route_capabilities() -> None:
    github = next(s for s in all_services() if s.id == "github")
    assert github.kind is ServiceKind.VCS
    assert github.is_available is True
    assert set(github.capabilities) == {
        "dashboard", "leases", "appeals", "baseline", "graph", "audit",
    }


def test_demo_tracker_is_registered_but_unavailable() -> None:
    demo = next(s for s in all_services() if s.id == "demo-tracker")
    assert demo.kind is ServiceKind.ISSUE_TRACKER
    assert demo.is_available is False
    assert set(demo.capabilities) == {"dashboard", "audit"}


async def test_get_vcs_provider_defaults_to_github(session: AsyncSession) -> None:
    provider = get_vcs_provider(session, TimeProvider(base_time_source=lambda: NOW))
    assert isinstance(provider, DatabaseVCSAdapter)


async def test_get_vcs_provider_rejects_unknown_id(session: AsyncSession) -> None:
    with pytest.raises(ServiceError) as excinfo:
        get_vcs_provider(session, TimeProvider(base_time_source=lambda: NOW), service_id="nope")
    assert excinfo.value.status_code == 404
```

**There is no `clock` fixture in `backend/tests/conftest.py`** — it provides only `engine`, `session` and `client`, plus an autouse `default_enforcement_mode`. Build the clock directly, exactly as `backend/tests/adapters/test_database_vcs.py:19` already does:

```python
NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
```

Import `AsyncSession` from `sqlalchemy.ext.asyncio`, `TimeProvider` from `app.core.time_provider`, and `ServiceError` from `app.services.errors`. Match the import ordering and style of `backend/tests/adapters/test_database_vcs.py`, which is the nearest neighbour to this file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/adapters/test_adapter_registration.py -q`
Expected: FAIL — `StopIteration`/`KeyError` on `demo-tracker`, and `TypeError` for the unexpected `service_id` argument.

- [ ] **Step 3: Implement registration**

In `backend/app/adapters/demo_service.py`: a module that calls `register(...)` for `demo-tracker` at import time. Its docstring must say in Polish that **this is a demonstrative stub, not an integration — it performs no operations and holds no data of its own**; it exists to prove the registry and per-service view gating are real.

In `backend/app/adapters/database_vcs.py`: call `register(...)` for `github` at module import, beside the class.

Both descriptors are the same values Task 1 puts in `_BUILTIN`; the `register()` calls here are what make the plugin seam real (`grep` invariant in Step 5). **Task 1's `register()` raises `ValueError` at import on a conflicting descriptor, so these values must match `_BUILTIN` exactly** — a wrong tuple is a loud import-time failure, not a silent difference. Read `backend/app/ports/service_registry.py` and copy its `_BUILTIN` descriptors rather than retyping them from this brief; the canonical values are:

- `github` — `id="github"`, `name="GitHub"`, `kind=ServiceKind.VCS`, `capabilities=("dashboard", "leases", "appeals", "baseline", "graph", "audit")`, `is_available=True`
- `demo-tracker` — `id="demo-tracker"`, `name="Demo Tracker (integracja demonstracyjna)"`, `kind=ServiceKind.ISSUE_TRACKER`, `capabilities=("dashboard", "audit")`, `is_available=False`

In `backend/app/api/v1/deps.py`: import `demo_service` for its registration side effect, give `get_vcs_provider` the `service_id: str = "github"` parameter, and raise `ServiceError(404, f"Unknown service {service_id}")` when the id is not in `all_services()`. Keep the default so existing callers are unaffected.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/adapters/ tests/ports/ -q`
Expected: PASS

- [ ] **Step 5: Verify the registration claim directly**

Run: `grep -rn "register(" backend/app/adapters`
Expected: exactly two matches — one in `database_vcs.py`, one in `demo_service.py`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/adapters/ backend/app/api/v1/deps.py backend/tests/adapters/
git commit -m "feat(backend): register github and a labelled demo service"
```

---

### Task 3: Service catalog endpoint, schema and contract

**Files:**
- Create: `backend/app/schemas/service.py`
- Create: `backend/app/api/v1/services.py`
- Modify: `backend/app/schemas/__init__.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/contract/schema.json` (regenerated — do not hand-edit)
- Modify: `frontend/src/types/api.ts` (regenerated — do not hand-edit)
- Test: `backend/tests/api/test_services.py` (create)

**Interfaces:**
- Consumes: `all_services()` (Task 1), the two registrations (Task 2).
- Produces: `ServiceRead` Pydantic model (`id: str`, `name: str`, `kind: ServiceKind`, `capabilities: list[str]`, `is_available: bool`); the TypeScript interface `ServiceRead` and union `ServiceKind` in `frontend/src/types/api.ts`; endpoint `GET /api/v1/services` → `list[ServiceRead]`.

- [ ] **Step 1: Write the failing API test**

Create `backend/tests/api/test_services.py`, following the client-construction style already used in `backend/tests/api/` (read a neighbouring test first and match it).

```python
async def test_services_catalog_returns_github_and_demo(client) -> None:
    response = await client.get("/api/v1/services")
    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == ["demo-tracker", "github"]

async def test_github_entry_carries_vcs_kind_and_six_capabilities(client) -> None:
    body = (await client.get("/api/v1/services")).json()
    github = next(item for item in body if item["id"] == "github")
    assert github["kind"] == "vcs"
    assert github["is_available"] is True
    assert sorted(github["capabilities"]) == [
        "appeals", "audit", "baseline", "dashboard", "graph", "leases",
    ]


async def test_demo_tracker_entry_is_marked_unavailable(client) -> None:
    body = (await client.get("/api/v1/services")).json()
    demo = next(item for item in body if item["id"] == "demo-tracker")
    assert demo["is_available"] is False
    assert demo["kind"] == "issue_tracker"


async def test_catalog_order_is_deterministic(client) -> None:
    first = await client.get("/api/v1/services")
    second = await client.get("/api/v1/services")
    # Assert on the status too: without it this test PASSES during RED, because two
    # identical 404 bodies compare equal — it would prove nothing about ordering.
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/api/test_services.py -q`
Expected: FAIL — 404 Not Found.

- [ ] **Step 3: Implement schema, router and endpoint**

`backend/app/schemas/service.py` defines `ServiceRead` with `model_config = ConfigDict(from_attributes=True)`. `ServiceRead.from_descriptor(descriptor: ServiceDescriptor) -> ServiceRead` is a classmethod converting `capabilities: tuple[str, ...]` to `list[str]`. Add `ServiceRead` to `CONTRACT_RESPONSE_MODELS` and `__all__` in `backend/app/schemas/__init__.py`. `backend/app/api/v1/services.py` exposes `GET /api/v1/services` returning `[ServiceRead.from_descriptor(s) for s in all_services()]`; include it in `backend/app/api/v1/router.py`.

- [ ] **Step 4: Regenerate the contract and TypeScript types**

Run, in this order:
```bash
cd backend
UV_CACHE_DIR=<repo>/.uv-cache uv run python scripts/export_contract.py
npm_config_cache=<repo>/.npm-cache npx --yes json-schema-to-typescript@15 -i contract/schema.json -o ../frontend/src/types/api.ts --unreachableDefinitions --additionalProperties=false --bannerComment "/* AUTO-GENERATED from backend/contract/schema.json - do not edit. Regenerate: see backend/README.md */"
```

**Both prefixes are required in this sandbox.** `uv` cannot reach `~/.cache/uv`, and `npx` fails with `EACCES … /home/kuba/.npm/_cacache` because that cache is root-owned and outside the sandbox. `.gitignore:23` already provides for `.npm-cache/` with the comment "sandbox nie ma dostępu do ~/.npm". The generator output is byte-identical with the cache redirected (verified by running it twice and comparing sha256), so the committed artifact is what the plain command would produce.

Expected: `contract/schema.json` gains `$defs.ServiceRead` and `$defs.ServiceKind`; `frontend/src/types/api.ts` gains `export interface ServiceRead` and the `ServiceKind` union.

- [ ] **Step 5: Run tests and confirm the contract guard passes**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/api/test_services.py tests/schemas/test_contract_is_fresh.py -q`
Expected: PASS — the freshness test is the authority on whether regeneration actually happened.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/ backend/app/api/v1/ backend/tests/api/test_services.py backend/contract/schema.json frontend/src/types/api.ts
git commit -m "feat(backend): expose GET /api/v1/services and regenerate the contract"
```

---

### Task 4: Frontend service registry and brand icons

**Files:**
- Create: `frontend/src/services/serviceRegistry.ts`
- Create: `frontend/src/services/brandIcons.tsx`
- Test: `frontend/src/services/serviceRegistry.test.ts`

**Interfaces:**
- Consumes: the generated `ServiceRead`/`ServiceKind` types (Task 3).
- Produces: `ServiceRouteId` union (`'dashboard' | 'leases' | 'appeals' | 'baseline' | 'graph' | 'audit'`); `ServiceIconComponent` (`{ className?: string; 'aria-hidden'?: boolean }` — kept broad: both lucide and the brand marks render the attribute hardcoded as "true", and narrowing it would fight `LucideProps` for no gain); `ServiceRoute` (`id`, `path`, `label`, `icon`); `ServiceConfig` (`id: string`, `icon`, `routes`, `defaultRouteId` — plain `string`, no `ServiceId` alias, since nothing consumes one); `SERVICE_REGISTRY: Record<string, ServiceConfig>`; `getServiceConfig(id: string): ServiceConfig | undefined`; `getDefaultPath(id: string): string`; `isRouteSupported(id: string, path: string): boolean`; `fallbackIcon: ServiceIconComponent`; `GitHubIcon`, `GitLabIcon`.

**Two invariants this task must satisfy, both pinned by tests** (they came out of the Task 4 review, where the first was a real blank-screen defect and the second a regression of URLs that work today):

1. **`isRouteSupported` must normalise the path the way React Router does** — strip a trailing `/` (except for the root `/`) and compare case-insensitively. React Router 7 matches `/leases/` and `/Leases` to the `/leases` route (`caseSensitive` defaults to `false`), so a naive character-exact comparison would make the Task 6 guard redirect addresses that **currently render a view**. Add tests for both normalisations.
2. **The guard must not reject its own redirect target.** For an id the frontend registry does not know, `getDefaultPath` returns `/`, so `isRouteSupported(id, '/')` must be `true`; otherwise Task 6's `<Navigate to={getDefaultPath(id)}>` lands on a path the same predicate rejects, `<Outlet/>` never renders, and the shell goes blank — precisely the case `fallbackIcon` exists for. Pin the invariant with a test over `'does-not-exist'`, `'toString'` and `'constructor'`: `isRouteSupported(id, getDefaultPath(id)) === true`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/services/serviceRegistry.test.ts`:

```ts
it('gives every registered service a non-empty route list', () => {
  for (const config of Object.values(SERVICE_REGISTRY)) {
    expect(config.routes.length).toBeGreaterThan(0);
  }
});

it('points every defaultRouteId at a route the service actually has', () => {
  for (const config of Object.values(SERVICE_REGISTRY)) {
    expect(config.routes.map((route) => route.id)).toContain(config.defaultRouteId);
  }
});

it('supports /audit in both services but /leases only in github', () => {
  expect(isRouteSupported('github', '/audit')).toBe(true);
  expect(isRouteSupported('demo-tracker', '/audit')).toBe(true);
  expect(isRouteSupported('github', '/leases')).toBe(true);
  expect(isRouteSupported('demo-tracker', '/leases')).toBe(false);
});

it('resolves the default path of a service without leases to the dashboard', () => {
  expect(getDefaultPath('demo-tracker')).toBe('/');
});

it('returns undefined for an unregistered service', () => {
  expect(getServiceConfig('does-not-exist')).toBeUndefined();
});

it('declares exactly the six route ids the backend grants github', () => {
  const github = SERVICE_REGISTRY.github;
  expect(github.routes.map((route) => route.id).sort()).toEqual([
    'appeals', 'audit', 'baseline', 'dashboard', 'graph', 'leases',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest --run src/services/serviceRegistry.test.ts`
Expected: FAIL — cannot resolve `@/services/serviceRegistry`.

- [ ] **Step 3: Implement the registry and brand icons**

`brandIcons.tsx` exports `GitHubIcon` and `GitLabIcon`: `fill="currentColor"`, `viewBox="0 0 24 24"`, `aria-hidden="true"`, forwarding `className`, typed as `ServiceIconComponent`, and **with `width="1em"` / `height="1em"`** so a mark rendered without a `className` does not inflate to the 300×150 default of a replaced element (lucide emits `width="24" height="24"`; without explicit dimensions the two are interchangeable by type but not by default rendering). Use the official GitHub mark path and a simplified monochrome GitLab mark — both inherit `currentColor` so they obey the token rules.

`serviceRegistry.ts` defines the six shared routes **once** (each with its Polish label from `Sidebar.tsx:7-12` and its lucide icon) and reuses them across services rather than duplicating labels. `github` gets all six (`defaultRouteId: 'dashboard'`, `icon: GitHubIcon`); `demo-tracker` gets `dashboard` and `audit` only (`defaultRouteId: 'dashboard'`, `icon: fallbackIcon`). **Do not assign `GitLabIcon` to `demo-tracker`**: the spec defines that service as "Demo Tracker (integracja demonstracyjna)", kind `ISSUE_TRACKER`, while GitLab appears only as a future, explicitly out-of-scope adapter — the picker shows the active service's icon, so a GitLab fox beside "Demo Tracker" reads as a GitLab connection that does not exist. Leaving an export unused is not dead code; `GitLabIcon` is reserved for that future adapter. `fallbackIcon` is the lucide `Blocks` icon.

Implement both invariants from the Interfaces block: `isRouteSupported` normalises the path (strip a trailing `/` except for the root, compare case-insensitively) and returns `true` for `getDefaultPath(id)` even when the id is unknown. `isRouteSupported` still returns `false` for an unknown service id on any *other* path.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest --run src/services/serviceRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/
git commit -m "feat(frontend): service registry with brand icons and per-service routes"
```

---

### Task 5: Services data layer, shared fixture and MSW handler

**Files:**
- Create: `shared/fixtures/services.json`
- Modify: `shared/fixtures/manifest.json`
- Create: `frontend/src/api/fixtures/services.ts`
- Create: `frontend/src/api/services.ts`
- Create: `frontend/src/hooks/useServices.ts`
- Create: `frontend/src/test/msw/domains/services.ts`
- Modify: `frontend/src/test/msw/handlers.ts`
- Test: `frontend/src/api/services.test.ts`

**Interfaces:**
- Consumes: `ServiceRead` (Task 3); `getJson` from `@/api/client`; `shouldUseFixtures` from `@/api/config`.
- Produces: `servicesFixture: ServiceRead[]`; `fetchServices(): Promise<ServiceRead[]>`; `useServices(): UseQueryResult<ServiceRead[]>` with query key `['services']`; the MSW handler for `GET /api/v1/services`.

- [ ] **Step 1: Add the shared fixture and register it in the manifest**

Create `shared/fixtures/services.json` as a JSON array of exactly two objects matching `ServiceRead` field-for-field:

```json
[
  {
    "id": "demo-tracker",
    "name": "Demo Tracker (integracja demonstracyjna)",
    "kind": "issue_tracker",
    "capabilities": ["dashboard", "audit"],
    "is_available": false
  },
  {
    "id": "github",
    "name": "GitHub",
    "kind": "vcs",
    "capabilities": ["dashboard", "leases", "appeals", "baseline", "graph", "audit"],
    "is_available": true
  }
]
```

Append a `fixtures[]` entry to `shared/fixtures/manifest.json` with `"id": "services"`, `"file": "services.json"`, `"shape": "list"`, `"model": "ServiceRead"`, `"kind": "response"`, `"consumedBy": ["frontend:service-picker"]`, `"status": "provisional"`. The `model` must already exist in `schema.json` — it does after Task 3.

- [ ] **Step 2: Validate the fixture against the contract**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/contract -q`
Expected: PASS — the manifest-driven test validates the new file automatically; no new test code needed.

- [ ] **Step 3: Write the failing frontend tests**

Create `frontend/src/api/services.test.ts`:

```ts
it('reads the catalog from the API when fixtures are off', async () => {
  vi.stubEnv('VITE_USE_FIXTURES', 'false');
  await expect(fetchServices()).resolves.toHaveLength(2);
});

it('returns the shared fixture when VITE_USE_FIXTURES is true', async () => {
  vi.stubEnv('VITE_USE_FIXTURES', 'true');
  const services = await fetchServices();
  expect(services.map((service) => service.id)).toEqual(['demo-tracker', 'github']);
});

it('surfaces a 500 from the catalog endpoint as ApiError', async () => {
  vi.stubEnv('VITE_USE_FIXTURES', 'false');
  server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));
  await expect(fetchServices()).rejects.toBeInstanceOf(ApiError);
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd frontend && npx vitest --run src/api/services.test.ts`
Expected: FAIL — cannot resolve `@/api/services`; with `onUnhandledRequest: 'error'` the first test also reports an unhandled request.

- [ ] **Step 5: Implement fixture barrel, API module, hook and handler**

`frontend/src/api/fixtures/services.ts` re-exports `servicesJson as ServiceRead[]` from `@shared/fixtures/services.json`, with a short Polish doc comment explaining it is the shared, Pydantic-validated demo catalog (mirroring `fixtures/leases.ts`). `frontend/src/api/services.ts` mirrors `api/leases.ts` exactly: `shouldUseFixtures()` returns the fixture, otherwise `getJson<ServiceRead[]>('/api/v1/services')`. `hooks/useServices.ts` mirrors `useLeases.ts` with query key `['services']`.

`frontend/src/test/msw/domains/services.ts` exports `servicesHandlers` returning `HttpResponse.json(servicesFixture)`, reusing the fixture so runtime and test data keep one source of truth. Add the spread to `frontend/src/test/msw/handlers.ts`.

- [ ] **Step 6: Run to verify it passes**

Run: `cd frontend && npx vitest --run src/api/services.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add shared/fixtures/ frontend/src/api/ frontend/src/hooks/useServices.ts frontend/src/test/msw/
git commit -m "feat(frontend): services data layer over the shared fixture"
```

---

### Task 6: Services context, route guard and test provider

**Files:**
- Create: `frontend/src/services/ServicesContext.tsx`
- Create: `frontend/src/services/ServiceRouteGuard.tsx`
- Modify: `frontend/src/test/renderWithProviders.tsx`
- Test: `frontend/src/services/ServicesContext.test.tsx`, `frontend/src/services/ServiceRouteGuard.test.tsx`

**Interfaces:**
- Consumes: `useServices` (Task 5); `getServiceConfig`, `getDefaultPath`, `isRouteSupported`, `ServiceConfig` (Task 4); generated `ServiceRead` (Task 3).
- Produces: `ServicesProvider`; `useActiveService(): ServiceContextValue`; `useServicesContext(): ServiceContextValue`; `ServiceContextValue { activeService: ServiceRead; services: ServiceRead[]; setActiveService: (id: string) => void; isPending: boolean; isError: boolean }`; `ServiceRouteGuard`; a `renderWithProviders` whose tree includes `ServicesProvider`.

- [ ] **Step 1: Write the failing context tests**

Create `frontend/src/services/ServicesContext.test.tsx`. Use a small probe component calling `useActiveService()` and rendering the active id, mounted through `renderWithProviders` with `route: '/'`.

```ts
it('defaults to github when storage is empty', async () => {
  window.localStorage.clear();
  renderWithProviders(<ActiveServiceProbe />);
  expect(await screen.findByTestId('active-service')).toHaveTextContent('github');
});

it('restores a stored selection', async () => {
  window.localStorage.setItem('lease-governor.service', 'demo-tracker');
  renderWithProviders(<ActiveServiceProbe />);
  expect(await screen.findByTestId('active-service')).toHaveTextContent('demo-tracker');
});

it.each(['{', 'null', '[]', 'not-json', ''])(
  'falls back to github for malformed stored value %s',
  async (stored) => {
    window.localStorage.setItem('lease-governor.service', stored);
    renderWithProviders(<ActiveServiceProbe />);
    expect(await screen.findByTestId('active-service')).toHaveTextContent('github');
  },
);

it('falls back to github when the stored service is not in the catalog', async () => {
  window.localStorage.setItem('lease-governor.service', 'decommissioned');
  renderWithProviders(<ActiveServiceProbe />);
  expect(await screen.findByTestId('active-service')).toHaveTextContent('github');
});

it('still selects for the session when localStorage.setItem throws', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
  renderWithProviders(<ServiceSwitcherProbe />);
  await userEvent.click(await screen.findByRole('button', { name: 'Przełącz na demo-tracker' }));
  expect(screen.getByTestId('active-service')).toHaveTextContent('demo-tracker');
});

it('throws when useActiveService is called outside the provider', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<ActiveServiceProbe />)).toThrow();
});
```

- [ ] **Step 2: Write the failing route-guard tests**

Create `frontend/src/services/ServiceRouteGuard.test.tsx`. Mount `ServiceRouteGuard` inside `MemoryRouter` with the route under test, with `localStorage` preselecting the service, and assert what renders.

```ts
it('redirects a view the active service does not serve', async () => {
  window.localStorage.setItem('lease-governor.service', 'demo-tracker');
  renderWithProviders(<GuardedRoutes />, { route: '/leases' });
  expect(await screen.findByTestId('dashboard-marker')).toBeInTheDocument();
});

it('keeps a view both services serve', async () => {
  window.localStorage.setItem('lease-governor.service', 'demo-tracker');
  renderWithProviders(<GuardedRoutes />, { route: '/audit' });
  expect(await screen.findByTestId('audit-marker')).toBeInTheDocument();
});

it('renders a github-only view when github is active', async () => {
  window.localStorage.setItem('lease-governor.service', 'github');
  renderWithProviders(<GuardedRoutes />, { route: '/leases' });
  expect(await screen.findByTestId('leases-marker')).toBeInTheDocument();
});
```

Add the empty-catalog and missing-github cases as tests of the picker/context boundary: with the MSW handler overridden to return `[]`, the provider must render its children without throwing; with a catalog that omits `github`, `activeService` must not be `github`.

- [ ] **Step 3: Run both new test files to verify they fail**

Run: `cd frontend && npx vitest --run src/services/`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement context, guard and test provider**

`ServicesContext.tsx`: `ServicesProvider` calls `useServices()`, resolves the active service with this precedence — (1) a stored id that exists in the catalog, (2) `github` when present in the catalog, (3) the first catalog entry — and exposes it. Read the stored value lazily via a `useState` initialiser wrapped so that `JSON.parse` is unnecessary (the stored value is a bare id, so validate it as a string against the catalog) and any `localStorage` access error is swallowed. Persist on change inside a `try/catch`. When the catalog is empty, still render children with a safe placeholder so the app never white-screens. `useActiveService` throws `new Error('useActiveService must be used within ServicesProvider')` when the context is absent.

`ServiceRouteGuard.tsx`: reads `useLocation().pathname` and returns `<Navigate to={getDefaultPath(activeService.id)} replace />` when `isRouteSupported` is false, otherwise `<Outlet />`. Use the declarative `<Navigate>` — never a `useEffect` redirect.

**Carry-forward condition from the Task 4 review (do not skip):** `isRouteSupported` normalises a trailing `/` and letter case, but it does **not** understand parameterised routes — `/leases/42` is deliberately `false` because `App.tsx` declares only six flat routes today. If you add any route with a path parameter while doing this task, `isRouteSupported` must switch to `matchRoutes`/prefix matching first, or the guard will silently bounce that detail page to `/`. No test goes red on that trigger, so it is on you to notice. If you add no parameterised route, leave the predicate alone.

`test/renderWithProviders.tsx`: wrap `{children}` in `<ServicesProvider>` inside `MemoryRouter` (the provider needs router context for the guard). Keep the single `Toaster`. This is a one-place change that keeps all 20 existing test files working, because the default service is `github` with all six routes.

- [ ] **Step 5: Run the services tests and then the whole suite for regressions**

Run: `cd frontend && npx vitest --run src/services/ && npm test -- --run`
Expected: new tests PASS; suite still PASS. If pre-existing tests fail because the provider fetches `/api/v1/services` before the handler loads, confirm the Task 5 handler is registered in `handlers.ts`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/ frontend/src/test/renderWithProviders.tsx
git commit -m "feat(frontend): active-service context and per-service route guard"
```

---

### Task 7: Picker control, TopBar and Sidebar wiring

**Files:**
- Create: `frontend/src/components/layout/ServicePicker.tsx`
- Create: `frontend/src/lib/selectClasses.ts`
- Modify: `frontend/src/components/layout/TopBar.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/appeals/AppealForm.tsx`, `frontend/src/components/graph/GraphFilters.tsx`, `frontend/src/components/audit/AuditFilters.tsx`
- Test: `frontend/src/components/layout/ServicePicker.test.tsx`, `TopBar.test.tsx`, `Sidebar.test.tsx`

**Interfaces:**
- Consumes: `useActiveService` (Task 6); `SERVICE_REGISTRY`, `getServiceConfig` (Task 4); `SELECT_CLASSES` (this task).
- Produces: `ServicePicker`; `SELECT_CLASSES: string` in `@/lib/selectClasses`; a TopBar whose right side is one flex group; a Sidebar driven by the active service's routes; an `App.tsx` with `ServicesProvider` and `ServiceRouteGuard`.

- [ ] **Step 1: Write the failing picker tests**

Create `frontend/src/components/layout/ServicePicker.test.tsx`:

```ts
it('exposes an accessible name for the selector', async () => {
  renderWithProviders(<ServicePicker />);
  expect(await screen.findByLabelText('Usługa')).toBeInTheDocument();
});

it('switches the active service through selectOptions', async () => {
  renderWithProviders(<ServicePicker />);
  await userEvent.selectOptions(await screen.findByLabelText('Usługa'), 'demo-tracker');
  expect(screen.getByTestId('active-service')).toHaveTextContent('demo-tracker');
});

it('marks an unavailable service in its option label', async () => {
  renderWithProviders(<ServicePicker />);
  const option = await screen.findByRole('option', { name: /Demo Tracker.*niedostępna/ });
  expect(option).toBeInTheDocument();
});

it('navigates to the default view when the current one is unsupported', async () => {
  window.localStorage.setItem('lease-governor.service', 'github');
  renderWithProviders(<GuardedRoutes />, { route: '/leases' });
  await userEvent.selectOptions(await screen.findByLabelText('Usługa'), 'demo-tracker');
  expect(await screen.findByTestId('dashboard-marker')).toBeInTheDocument();
});

it('degrades visibly when the catalog request fails, without trapping the user', async () => {
  server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));
  renderWithProviders(<ServicePicker />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/usług/i);
  // Ruling 21: the selector must survive the failure — a user stuck on a stale stored
  // service has to be able to switch away while the backend is down.
  expect(screen.getByLabelText('Usługa')).toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing shell tests**

`TopBar.test.tsx`: assert the right-hand group contains both `ServicePicker` and the `time-travel-bar` slot, and that the header still has exactly two element children (the layout regression guard from spec §10). `Sidebar.test.tsx`: assert six nav links for `github` and exactly two (`Pulpit`, `Audyt`) for `demo-tracker`.

- [ ] **Step 3: Run to verify they fail**

Run: `cd frontend && npx vitest --run src/components/layout/`
Expected: FAIL — `ServicePicker` does not exist.

- [ ] **Step 4: Extract `SELECT_CLASSES` and implement the picker**

Move the duplicated string from `AppealForm.tsx:21-22`, `GraphFilters.tsx:21-22` and `AuditFilters.tsx:25-26` into `frontend/src/lib/selectClasses.ts` as one exported constant and import it in all four places, keeping each existing comment about why a native `<select>` was chosen.

`ServicePicker.tsx` renders: an `sr-only` `<Label htmlFor="service-picker">Usługa</Label>`; a `<span>` holding the active service's icon at `size-4` with `text-muted-foreground`; and a native `<select id="service-picker">` using `SELECT_CLASSES` plus `h-8`, rendering catalog entries as options with the `(niedostępna)` suffix when `is_available` is false. A stored value missing from the catalog appears as an own option `(nieznana)`. Do not use `--primary` for the control.

**Two small clean-ups carried forward from Task 6's review — do these while you are in `ServicesContext.tsx`:**

1. **Qualify the stale comment at `ServicesContext.tsx:105`.** It states, unqualified, that the picker never offers an option outside the frontend registry — false for a settled catalog (spec §5.6.1, Ruling 23). The surrounding block is correctly scoped, so the defect is that one sentence; a future editor trusting it would "restore" the registry-first gate that Ruling 23 rejected. Add the scope, e.g. "w stanach 2 i 3 / dopóki katalog nie jest rozstrzygnięty". No behaviour change.
2. **Optional but cheap:** the settled + in-catalog + registry-known cell is pinned to *accept* but not to *write* — add a post-click `localStorage` read there so "accepted but write skipped" cannot hide.



**Error behaviour — settled, do not re-litigate (Ruling 21):** when the catalog request fails, **keep rendering the selector and show a destructive `Alert` alongside it** — never replace the selector with the alert. Reason: the selector can still render the frontend registry's known services, so a user stuck on a stale stored service must be able to switch away while the backend is down; replacing the selector with an alert leaves them trapped. This is also why `setActiveService` accepts a selection while the catalog is unknown-but-failed as well as while it is pending — a dead click on a visible option is the worse failure. Never throw during render.

**Pending behaviour:** while the catalog is pending, render the selector from the frontend registry rather than a spinner (`DESIGN.md:98` forbids a spinner in content). Set `aria-busy` while pending. Note `activeService.id` is `''` for the whole pending window, so **do not key anything off it** — key off `isPending`.

- [ ] **Step 5: Wire TopBar, Sidebar and App**

`TopBar.tsx`: replace the hardcoded title with `Lease Governor` and the subtitle with `Nadzór nad czasowym dostępem`; wrap the picker and the untouched `w-72` time slot in a single `<div className="flex items-center justify-end gap-4">` so `justify-between` keeps two children.

`Sidebar.tsx`: delete the module-level `NAV_ITEMS`; map `getServiceConfig(activeService.id)?.routes ?? []`, keeping the `title` + `sr-only xl:not-sr-only` idiom and the existing active/inactive classes. Make the subtitle read `Dostęp: {activeService.name}`.

`App.tsx`: wrap the layout route's children in `ServicesProvider` and insert `<ServiceRouteGuard />` as the element that renders the six child routes through its `<Outlet />`, so the guard sits inside `AppShell` and outside the pages.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest --run src/components/layout/ && npm test -- --run`
Expected: PASS, including the pre-existing `App.test.tsx` and `App.integration.test.tsx` whose six-link assertions must still hold under the default `github` service.

**Carry-forward from Task 6 (do not rediscover this as a mystery failure):** `renderWithProviders` now mounts `ServicesProvider`, which issues `GET /api/v1/services` on **every** mount. So any assertion of the form `expect(fetchSpy).not.toHaveBeenCalled()` on a *global* `vi.spyOn(globalThis, 'fetch')` is unsatisfiable, and any brand-new assertion you write must be scoped to a specific endpoint (`toHaveBeenCalledWith('/api/v1/...', expect.anything())`) rather than to total call count. Task 6 hit exactly this and narrowed one pre-existing assertion in `frontend/src/components/appeals/ActivityStats.test.tsx:95` under Ruling 18; a repo-wide scan found the other three global-fetch spies safe. If a pre-existing assertion in your path fails for this reason, narrow it to its endpoint and say so in your report — do not weaken it to nothing.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/selectClasses.ts frontend/src/components/ frontend/src/App.tsx
git commit -m "feat(frontend): service picker in the top bar with per-service navigation"
```

---

### Task 8: Namespace query keys by service

**Files:**
- Modify: `frontend/src/hooks/useLeases.ts`, `useDashboard.ts`, `useGraph.ts`, `useAuditLog.ts`, `useAppeals.ts`, `useActivityStats.ts`, `useTeamBaseline.ts`, `useOnboarding.ts`
- Modify: `frontend/src/hooks/useLeaseDecision.ts:22-26`
- Test: `frontend/src/hooks/useServiceScopedKeys.test.tsx` (create)

**Interfaces:**
- Consumes: `useActiveService` (Task 6).
- Produces: service-scoped query keys of the form `[<resource>, <serviceId>, ...]`, and invalidations that carry the same prefix. `['clock']` stays global.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/useServiceScopedKeys.test.tsx`. Mount a probe that records keys via the `queryClient` returned by `renderWithProviders`, with `localStorage` preselecting `demo-tracker`.

```ts
it('namespaces the leases key by the active service', async () => {
  window.localStorage.setItem('lease-governor.service', 'demo-tracker');
  const { queryClient } = renderWithProviders(<LeasesProbe />);
  await waitFor(() => {
    const keys = queryClient.getQueryCache().getAll().map((query) => query.queryKey);
    expect(keys).toContainEqual(['leases', 'demo-tracker']);
  });
});

it('keeps the clock key global', async () => {
  const { queryClient } = renderWithProviders(<ClockProbe />);
  await waitFor(() => {
    const keys = queryClient.getQueryCache().getAll().map((query) => query.queryKey);
    expect(keys).toContainEqual(['clock']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest --run src/hooks/useServiceScopedKeys.test.tsx`
Expected: FAIL — the cache holds `['leases']`, not `['leases', 'demo-tracker']`.

- [ ] **Step 3: Add the prefix to every service-scoped hook**

Each hook reads `const { activeService } = useActiveService();` and builds its key as `['leases', activeService.id]` (and `['dashboard', id]`, `['graph', id]`, `['audit', id]`, `['appeals', id, query]`, `['activity-stats', id, lease_id]`, `['baseline', id, team_slug]`, `['onboarding', id, login]`). In `useLeaseDecision.ts:22-26`, invalidate the matching service-scoped key arrays instead of the bare ones. Leave `useTimeTravel` and `useDemoReset` invalidating everything — that stays correct — and leave `['clock']` unprefixed.

- [ ] **Step 4: Run the full suite**

Run: `cd frontend && npm test -- --run`
Expected: PASS. Existing tests that spy on `invalidateQueries` may need their expected key arrays updated to the namespaced form; update the expectation, not the production code, and only where the assertion names the key explicitly.

**Carry-forward from Task 6:** `renderWithProviders` now mounts `ServicesProvider`, which issues `GET /api/v1/services` on every mount, so a *global* `expect(fetchSpy).not.toHaveBeenCalled()` is unsatisfiable and any new fetch assertion must name a specific endpoint. A repo-wide scan found all remaining global-fetch spies safe, so this should not fire here — it is recorded so an unexpected failure is recognised rather than guessed at (see Ruling 18). Read the keys you namespace against the current hook sources, not against memory of them.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/
git commit -m "refactor(frontend): namespace query cache per service"
```

---

### Task 9: Documentation

**Files:**
- Create: `docs/adr/0014-wybor-uslugi-i-rejestr-dostawcow.md`
- Modify: `docs/adr/README.md`
- Modify: `frontend/DESIGN.md`
- Modify: `README.md`
- Modify: `frontend/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: documentation consistent with the shipped code (`AGENTS.md`: "Kod i dokumentacja muszą być spójne").

- [ ] **Step 1: Write ADR 0014**

Follow the structure of the neighbouring ADRs. Record: flat routes with per-service gating; `localStorage` persistence instead of a route segment or query parameter; the backend registry as a deliberate in-code list rather than `entry_points` discovery; the native `<select>` decision. Record the rejected alternatives and why: a `/github/leases` route segment (breaks existing demo URLs and 20 test files), `entry_points` discovery (abstraction above the current reality), and Radix `Select` (already rejected three times in-repo for jsdom/testability reasons). **Number 0014 — the lowest free number**; 0010 and 0011 are already collided (spec §2.1) and must not be reused.

- [ ] **Step 2: Register the ADR in the index**

Append the `0014` row to the table in `docs/adr/README.md`. Verify the link target matches the filename exactly.

- [ ] **Step 3: Verify the ADR index tests did not regress**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/repo/test_docs_integrity.py -q`
Expected: **exactly 2 failed** — the same two pre-existing collisions. If the count is 3, the new ADR is not indexed correctly in Step 2.

- [ ] **Step 4: Document the control in DESIGN.md and the module in both READMEs**

`frontend/DESIGN.md`: a short section for the chrome picker — permitted size (`h-8`, `text-xs`), `--primary` reserved for selection, no second `default`-variant button, badge/icon rules already in force.

`README.md`: add `GET /api/v1/services` to the API description and note the service picker in the work-status table. **State that `capabilities` is returned in the registry's declaration order** — not sorted, and not guaranteed by the contract — so consumers must treat it as a set. Reason (finding from the Task 3 review): TypeScript sees a bare `string[]`, so a future reordering of the registry tuple would silently change the payload with every test still green.

`frontend/README.md`: document the new `src/services/` module and the `lease-governor.service` `localStorage` key.

**Two things ADR 0014 must state explicitly rather than leave implied:**

1. **Registration is declarative, not functional, today.** Both adapters call `register(...)`, but the catalog is served from the `_BUILTIN` entries, so those calls are a checked no-op (Ruling 10). Say so plainly — the ADR must not read as working plugin discovery.
2. **Jira is deliberately deferred.** A real second provider (`backend/app/api/jira_mock/`, ADR 0016, the `Repository.provider` column via `alembic/versions/0002_repository_provider.py`) exists on `remotes/origin/jira_mock` and is not merged into `frontend-integration` or `main`. The decision was to finish this branch without it and add its frontend registry entry as a separate task. Also record that because an unregistered service now degrades to the dashboard rather than blanking the shell (Ruling 12), Jira will be immediately usable — with a generic glyph and only the shared routes — the moment it merges. Note that their `Provider` enum (GITHUB/JIRA) is orthogonal to `ServiceKind` (VCS/ISSUE_TRACKER/CLOUD_IAM), so the two do not clash.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/ frontend/DESIGN.md README.md frontend/README.md
git commit -m "docs: ADR 0014 for the service picker and provider registry"
```

---

### Task 10: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Run every frontend gate serially**

Run: `cd frontend && npm run typecheck && npm run lint && npm test -- --run && npm run build`
Expected: all four exit 0. The suite must be at **183 + the new tests**, 0 failures. Run them **serially** — `typecheck` and `build` both invoke `tsc -b` against the same `tsbuildinfo` and racing them produces a spurious TS6196.

- [ ] **Step 2: Run the backend gate**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest -q`
Expected: **exactly 2 failed** (the pre-existing ADR collisions), with the passed count grown from 398. Any third failure is a regression from this branch.

- [ ] **Step 3: Confirm the contract guard and the registration invariant**

Run: `cd backend && UV_CACHE_DIR=<repo>/.uv-cache uv run pytest tests/schemas/test_contract_is_fresh.py tests/contract -q && grep -rn --include='*.py' "register(" app/adapters`
Expected: tests PASS; exactly two `register(` matches, in `database_vcs.py` and `demo_service.py`. **Use `--include='*.py'`** — without it the command also matches byte-compiled `__pycache__/*.pyc` once tests have run, and a future run would misread three extra binary-match lines as extra call sites.

- [ ] **Step 4: Confirm no file exceeds the enforced line limit**

Run: `cd frontend && npm run lint`
Expected: 0 errors, in particular no `max-lines` violation on the new modules.

- [ ] **Step 5: Report evidence**

Record the exact counts from Steps 1–2 for the PR body, which requires a command and its real output. Note in the PR that the two backend failures pre-date this branch and are documented in the spec.

---

## Self-Review

**Spec coverage.** §4 registry → Tasks 1–2; §4.4 endpoint → Task 3; §4.5 schemas and contract → Task 3; §5.1 registry and icons → Task 4; §5.3 data layer → Task 5; §5.2 context, §5.4 guard → Task 6; §5.5 control, §5.6 switching, §5.7 navigation and branding → Task 7; §5.3 query keys → Task 8; §6 `SELECT_CLASSES` reuse → Task 7 Step 4; §9 documentation → Task 9; §7 test plan → distributed across Tasks 1, 2, 3, 4, 6, 7, 8; §8 acceptance criteria → Task 10. Nothing uncovered.

**Type consistency.** `ServiceDescriptor`/`ServiceKind`/`register`/`all_services` are defined in Task 1 and used with the same names in Tasks 2–3. `ServiceRead` is produced in Task 3 and consumed as the TypeScript `ServiceRead` in Tasks 5–8. `ServiceConfig`/`ServiceRoute`/`ServiceRouteId`/`getDefaultPath`/`isRouteSupported`/`getServiceConfig`/`fallbackIcon` are produced in Task 4 and used in Tasks 6–7. `useActiveService` returns `ServiceContextValue` in Task 6 and is consumed in Tasks 7–8. The query-key shape `[resource, serviceId, ...]` is introduced in Task 8 consistently across all eight hooks and the decision invalidation.

**Review Focus placement.** Malformed `localStorage` → Task 6 Step 1 (`it.each` over `'{'`, `'null'`, `'[]'`, `'not-json'`, `''`). Throwing `setItem` → Task 6 Step 1. Empty catalog and catalog without `github` → Task 6 Step 2. Failed catalog request → Task 7 Step 1 (visible degradation) and Task 5 Step 3 (error surfaces as `ApiError`). Each line of the Review Focus section has a named test in the task that owns the code.
