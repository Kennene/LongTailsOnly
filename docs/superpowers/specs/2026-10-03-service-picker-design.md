# Specyfikacja: Wybór usługi (Service Picker) — panel wielu integracji

**Data:** 2026-10-03
**Autor:** Osoba 5 (KUBUŚ) — frontend + minimalne rozszerzenie backendu
**Status:** do przeglądu przed planem implementacji
**Powiązane dokumenty:** `PRODUKT.md`, `PLAN.md`, `GLOSSARY.md`, `CODING_STANDARDS.md`, `frontend/DESIGN.md`, ADR 0001, 0009, 0010, 0011, `docs/superpowers/specs/2026-10-03-frontend-spa-design.md`

---

## 1. Cel i zrozumienie intencji

Panel ma przestać być panelem *jednej* integracji. Użytkownik wybiera, **z którą usługą** (GitHub, w przyszłości GitLab, Jira, chmurowe IAM) pracuje, a aplikacja pokazuje widoki obsługiwane przez tę usługę.

Produkt od początku deklaruje architekturę pluginową (Porty i Adaptery), ale **w kodzie nie ma żadnego mechanizmu rejestru** — patrz §2. Ta zmiana domyka tę lukę: wprowadza rejestr dostawców po stronie backendu i wynikający z niego wybór usługi po stronie frontendu.

**Kryterium sukcesu:** administrator widzi w pasku górnym kontrolkę z ikoną i nazwą aktywnej usługi, może przełączyć usługę, a przełączenie zmienia dostępne pozycje nawigacji i nie pozwala wejść na widok, którego dana usługa nie obsługuje.

### Świadome ograniczenie zakresu

Rejestrujemy **jedną realną usługę (GitHub)** oraz **jedną jawnie oznaczoną usługę demonstracyjną**. Nie budujemy drugiego działającego adaptera ani izolacji danych per usługa — patrz §10 „Poza zakresem”.

---

## 2. Stan wyjściowy (ustalony dowodami)

| Ustalenie | Dowód |
| --- | --- |
| Brak rejestru pluginów, discovery, `entry_points`, `importlib` w całym `backend/` | `grep` po `backend/app`, `backend/alembic`, `backend/scripts` — zero trafień |
| Istnieją dokładnie dwa porty | `backend/app/ports/vcs_provider.py:6`, `backend/app/ports/clock.py:6` |
| Istnieje jeden adapter w `adapters/` | `backend/app/adapters/database_vcs.py:19` |
| `GitHubMockAdapter` z dokumentacji **nie istnieje** w kodzie | brak trafień w `*.py`; `get_vcs_provider` (`app/api/v1/deps.py:31-37`) zwraca `DatabaseVCSAdapter` |
| Brak encji organizacji/usługi | `github_org` to skalar (`app/core/config.py:10`), `Repository.owner` to `String(64)` (`app/models/repository.py:12`), `ORG_ID = 1` na sztywno (`app/schemas/github_payloads.py:12`) |
| Brak endpointu metadanych usługi | jedyny nietematyczny endpoint to `GET /health` (`app/main.py:36-39`) |
| Brak typu provider/service/tenant w kontrakcie | `schema.json` nie zawiera nawet podciągu `org` |
| Brak wyboru usługi w SPA | 6 płaskich tras (`App.tsx:17-28`), 6 pozycji nawigacji (`Sidebar.tsx:6-13`) |
| Nawigacja i trasy to **dwie niezależne listy** | `Sidebar.tsx:6-13` vs `App.tsx:17-28` |
| „GitHub” zaszyty w trzech tekstach UI | `index.html:7`, `TopBar.tsx:12`, `Sidebar.tsx:28` |
| Klucze zapytań nie mają wymiaru usługi | `['leases']`, `['dashboard']`, `['graph']`, `['audit']`, `['appeals']`, `['clock']` |
| Bramki jakości zielone przed zmianą | typecheck 0 błędów, lint 0, **205 testów / 23 pliki**, build OK |

> **Uwaga środowiskowa (worktree agenta):** `uv` nie ma dostępu do `~/.cache/uv` w sandboxie. Testy backendu uruchamiamy z `UV_CACHE_DIR=<repo>/.uv-cache`, katalog już istnieje w repozytorium i jest ignorowany przez git. Bez tego `uv run` kończy się `Failed to initialize cache`.

**Trzy decyzje w kodzie, które wiążą ten projekt:**

1. **Radix `Select` został odrzucony trzykrotnie** — `AppealForm.tsx:19-22`, `GraphFilters.tsx:19-22`, `AuditFilters.tsx:23-26`: nie przyjmuje `userEvent.selectOptions` i wymaga polyfilli w jsdom. `components/ui/select.tsx` ma **zero importerów**. Nowa kontrolka nie może być czwartym wyjątkiem.
2. **`--primary` jest zarezerwowany** dla „akcji głównej, zaznaczenia i fokusu” (`DESIGN.md:52`), więc oznaczenie aktywnej usługi tym kolorem jest zgodne z systemem, ale kontrolka nie może stać się drugim przyciskiem `default`.
3. **Chrome nigdy nie przekracza `text-sm`** (`DESIGN.md:68`), a dolna granica `text-xs` ma tylko dwa wyjątki (`DESIGN.md:70`).

---

## 3. Decyzje architektoniczne

1. **Wybierana jest usługa, nie organizacja.** Jedna aktywna usługa naraz; przełączenie zmienia zbiór dostępnych widoków. Osadza się to na istniejącym porcie `VCSProvider`.
2. **Trasy zostają płaskie.** `/`, `/leases`, `/appeals`, `/baseline`, `/graph`, `/audit` bez prefiksu usługi. Gating polega na tym, że usługa **deklaruje obsługiwane trasy**; nieobsługiwana trasa przekierowuje na trasę domyślną tej usługi.
3. **Stan wybranej usługi jest kliencki i trwały między odświeżeniami** — `localStorage` pod kluczem `lease-governor.service`. **Nie używamy parametru zapytania ani segmentu ścieżki**, żeby nie zmienić kształtu istniejących adresów (205 testów i scenariusze demo polegają na `/leases` itd.).
4. **Klucze zapytań zyskują prefiks usługi:** `['leases']` → `['leases', serviceId]`. Inwalidacja bez klucza (podróż w czasie, reset demo — `useTimeTravel.ts:12`, `useDemoReset.ts:13`) pozostaje poprawna, bo unieważnia cały cache. `['clock']` zostaje globalny — zegar nie należy do usługi.
5. **Backend dostarcza tożsamość i metadane; frontend dostarcza prezentację.** Backend nie zna ikon ani komponentów React. `GET /api/v1/services` zwraca `id`, `name`, `kind`, `capabilities`, `is_available`. Ikona, trasa i etykiety nawigacji żyją w rejestrze frontendu.
6. **Rejestr frontendu jest pojedynczym źródłem prawdy dla UI.** Zamiast dwóch niezależnych list (nawigacja + trasy) powstaje jedna lista `SERVICE_CONFIG[id].routes` z polami `path`, `label`, `icon`. `Sidebar` i strażnik tras czytają z niej.
7. **Nie dodajemy zależności.** Ikony: `lucide-react` (obowiązkowy zestaw, `DESIGN.md:117`) plus dwa małe własne SVG dla znaków firmowych, bo lucide **usunął** ikony marek (`Github` i `Gitlab` nie istnieją w zainstalowanej wersji 1.51 — sprawdzone).
8. **Rejestr backendu to jawna lista w kodzie, nie discovery przez `entry_points`.** Przy dwóch adapterach discovery byłoby abstrakcją ponad stan faktyczny (`CODING_STANDARDS.md` §1.5). Rejestr jest jednym modułem i jednym publicznym API (`register` / `all_services`), więc podmiana na discovery w przyszłości dotknie jednego pliku.

---

## 4. Rejestr dostawców — backend

### 4.1 Nowy moduł `backend/app/ports/service_registry.py`

Rejestr jest **wspólnym, publicznym API**, z którego korzysta każdy adapter — dlatego mieszka w `ports/` obok definicji portu, a nie w `adapters/` (dzięki temu `adapters/` nie importuje sam siebie i nie powstaje cykl).

```python
"""Rejestr dostawców VCS/IAM (architektura pluginowa — ADR 0001).

Jedyne publiczne API rejestru: `register` i `all_services`.
Świadomie zwykła lista w kodzie, nie discovery przez entry_points
(CODING_STANDARDS.md §1.5 — przy dwóch adapterach to byłaby abstrakcja
ponad stan faktyczny). Podmiana na discovery dotknie wyłącznie tego pliku.
"""

class ServiceKind(StrEnum):
    VCS = "vcs"
    ISSUE_TRACKER = "issue_tracker"
    CLOUD_IAM = "cloud_iam"

@dataclass(frozen=True, slots=True)
class ServiceDescriptor:
    id: str
    name: str
    kind: ServiceKind
    capabilities: tuple[str, ...]
    is_available: bool

def register(descriptor: ServiceDescriptor) -> None: ...
def all_services() -> tuple[ServiceDescriptor, ...]: ...
```

**Kontrakt `all_services()`:** zwraca katalog posortowany po `id` (deterministyczny), a przy próbie rejestracji zduplikowanego `id` podnosi `ValueError` (głośna porażka zamiast cichego nadpisania).

**Wartości `capabilities`** to **identyfikatory tras** zgodne z rejestrem frontendu: `dashboard`, `leases`, `appeals`, `baseline`, `graph`, `audit`. Wybór tej osi (a nie nazw uprawnień) jest świadomy: to jedna, współdzielona oś, a weryfikowalność zapewnia test zgodności kontraktu (§7.4).

### 4.2 Rejestracja adapterów (cel: `grep -rn "register(" backend/app/adapters` zwraca dwa trafienia)

| Plik | Rejestruje | `capabilities` | `is_available` |
| --- | --- | --- | --- |
| `adapters/database_vcs.py` | `github` — „GitHub”, `VCS` | wszystkie sześć tras | `True` |
| `adapters/demo_service.py` **(nowy)** | `demo-tracker` — „Demo Tracker (integracja demonstracyjna)”, `ISSUE_TRACKER` | `("dashboard", "audit")` | `False` |

Plik `adapters/demo_service.py` musi mieć w docstringu wprost: *to zaślepka dowodowa, nie integracja — nie wykonuje żadnych operacji i nie ma własnych danych.* Rejestruje się **przez to samo publiczne API** co adapter realny.

### 4.3 `get_vcs_provider` zaczyna konsultować rejestr

```python
def get_vcs_provider(session: SessionDep, clock: ClockDep, service_id: str = "github") -> VCSProvider:
    """Zwraca adapter zarejestrowany pod `service_id`; nieznany id to 404."""
```

Domyślna wartość `github` chroni wszystkie istniejące wywołania i testy przed zmianą. Nowy kod może rozwiązywać dostawcę po `service_id`.

### 4.4 Endpoint `GET /api/v1/services`

- Router: nowy `backend/app/api/v1/services.py`, dołączony w `app/api/v1/router.py`.
- Odpowiedź: `list[ServiceRead]` — 200, posortowana po `id`.
- Brak parametrów i paginacji: katalog jest mały i zamknięty.

### 4.5 Schematy i kontrakt

Nowy `backend/app/schemas/service.py`:

```python
class ServiceRead(BaseModel):
    id: str
    name: str
    kind: ServiceKind
    capabilities: list[str]
    is_available: bool
```

`ServiceRead` trafia do `CONTRACT_RESPONSE_MODELS` w `app/schemas/__init__.py`. **Konsekwencja obowiązkowa:** po tej zmianie trzeba wygenerować kontrakt i typy TS (§7.5) — inaczej `tests/schemas/test_contract_is_fresh.py` pada.

---

## 5. Rejestr usług — frontend

### 5.1 Moduł `src/services/serviceRegistry.ts`

Pojedyncze źródło prawdy dla UI: trasa, etykieta nawigacji i ikona per usługa.

```ts
export type ServiceId = string;
export type ServiceRouteId = 'dashboard' | 'leases' | 'appeals' | 'baseline' | 'graph' | 'audit';
export type ServiceIconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

export interface ServiceRoute {
  id: ServiceRouteId;
  path: string;      // '/' | '/leases' | ...
  label: string;     // 'Pulpit' | 'Dzierżawy' | ...
  icon: ServiceIconComponent;
}

export interface ServiceConfig {
  id: ServiceId;
  icon: ServiceIconComponent;
  routes: ServiceRoute[];
  defaultRouteId: ServiceRouteId;
}
```

Eksporty: `SERVICE_REGISTRY`, `getServiceConfig(id)`, `getDefaultPath(id)`, `isRouteSupported(id, path)`, `fallbackIcon`.

**Znaki firmowe:** `src/services/brandIcons.tsx` z `GitHubIcon`, `GitLabIcon` (własne `SVG` z `viewBox="0 0 24 24"`, `fill="currentColor"`, `aria-hidden="true"`, `className` przekazywane tak jak w lucide). Rejestr używa `GitHubIcon` dla `github`; dla nieznanej usługi — `fallbackIcon` (lucide `Blocks`).

**Dwa rejestry:** `github` (pełna lista sześciu tras, `defaultRouteId: 'dashboard'`) i `demo-tracker` (`dashboard` + `audit`, `defaultRouteId: 'dashboard'`). Trasy współdzielone (`dashboard`, `audit`) są zdefiniowane **raz** i reużywane przez oba wpisy — bez duplikowania etykiet i ikon.

### 5.2 Kontekst i stan — `src/services/ServicesContext.tsx`

- `ServicesProvider` wykonuje `useServices()` (TanStack Query), rozwiązuje aktywną usługę i wystawia `ServiceContextValue { activeService, services, setActiveService, isPending, isError }`.
- Odczyt zapisanej usługi: leniwa inicjalizacja `useState` czytająca `localStorage` (klucz `lease-governor.service`), z walidacją wobec rejestru i katalogu z backendu.
- Zapis: `useEffect` przy zmianie aktywnej usługi. Odczyt/zapis `localStorage` w `try/catch` — prywatny tryb przeglądarki nie może wywalić panelu (`DESIGN.md:137`).
- Wybór nieistniejącej usługi jest ignorowany, a użytkownik wraca do domyślnej (`github`).
- **Gdy katalog z backendu nie zawiera zapisanej usługi** (np. integracja wyrejestrowana), provider wybiera pierwszą dostępną i **nie** kasuje zapisu po cichu — zapis zostaje, wybór degraduje się na czas sesji.

`useActiveService()` rzuca `Error`, gdy providera brakuje w drzewie — głośna porażka zamiast cichego `undefined`.

### 5.3 Warstwa danych

| Plik | Zmiana |
| --- | --- |
| `src/api/services.ts` **(nowy)** | `fetchServices(): Promise<ServiceRead[]>` — `shouldUseFixtures()` ? `servicesFixture` : `getJson('/api/v1/services')` |
| `src/hooks/useServices.ts` **(nowy)** | `useQuery({ queryKey: ['services'], queryFn: fetchServices })` |
| `src/hooks/*.ts` (8 plików) | prefiks usługi w `queryKey`: `['leases', activeService.id]` itd. |
| `src/api/fixtures/services.ts` **(nowy)** | barrel re-eksportujący `@shared/fixtures/services.json` |
| `shared/fixtures/services.json` **(nowy)** | katalog zgodny z `ServiceRead`: `github` (dostępny) + `demo-tracker` (niedostępny) |

### 5.4 Strażnik tras

`src/services/ServiceRouteGuard.tsx` — komponent-layout wewnątrz `AppShell`:

```
if (!isRouteSupported(activeService.id, location.pathname)) return <Navigate to={getDefaultPath(...)} replace />;
return <Outlet />;
```

Przekierowanie jest **deklaratywne** (`<Navigate>`), nie w `useEffect` — brak migotania treści i brak podwójnego renderu. Trasy pozostają zadeklarowane w `App.tsx`; strażnik tylko je bramkuje.

### 5.5 Kontrolka wyboru

`src/components/layout/ServicePicker.tsx`, osadzony w `TopBar` jako **pierwszy element nowej prawej grupy** — dzięki temu `justify-between` nadal ma dokładnie dwoje dzieci:

```tsx
<div className="flex items-center justify-end gap-4">
  <ServicePicker />
  <div data-slot="time-travel-bar" className="flex w-72 shrink-0 items-center justify-end">
    <TimeTravelBar />
  </div>
</div>
```

Kontrolka to **natywny `<select>`** (spójnie z `AppealForm`, `GraphFilters`, `AuditFilters`), z ikoną aktywnej usługi obok:

- `<Label htmlFor="service-picker" className="sr-only">Usługa</Label>` — nazwa dostępna.
- `<select className="h-8 rounded-lg border border-input bg-background py-1 pr-7 pl-2 text-xs">` — **bez własnego `appearance-none`**; przy dyskretnym rozmiarze natywna strzałka zapewnia afordancję bez nowej zależności.
- Ikona: `<span className="text-muted-foreground"><ActiveIcon className="size-4" aria-hidden="true" /></span>`.
- Opcje renderują `name` z backendu, a przy `is_available === false` dopisek `(niedostępna)`.
- Zapisany wybór, którego nie ma w katalogu, dochodzi jako opcja „(nieznana)” — użytkownik widzi prawdę zamiast pustego pola.

**Brak stanu ładowania jako spinnera:** zanim katalog dotrze, kontrolka renderuje się z rejestru frontendu (znane wpisy), a `aria-busy` jest ustawiane w trakcie. To zgodne z regułą „nigdy spinner w środku treści” (`DESIGN.md:98`) i nie blokuje szkieletu.

### 5.6 Zachowanie przy przełączeniu

1. Usługa docelowa nie istnieje w katalogu → ignoruj.
2. Bieżąca trasa jest obsługiwana przez usługę docelową → **zostań na trasie** (np. `/audit` działa w obu).
3. Bieżąca trasa nie jest obsługiwana → przejdź na `defaultRouteId` usługi docelowej.
4. Pozostałe parametry zapytania są zachowywane.

### 5.7 Nawigacja i branding

- `Sidebar.tsx`: `NAV_ITEMS` **znika**; pozycje pochodzą z `getServiceConfig(activeService.id).routes`. Poniżej `xl` zostaje dotychczasowy idiom `sr-only` + `xl:not-sr-only` + `title`.
- `TopBar.tsx`: lewy blok pokazuje **„Lease Governor”** (stałe, prawdziwe przy każdej usłudze) i podtytuł **„Nadzór nad czasowym dostępem”** — zamiast „GitHub Access Lease Governor”. Usługa jest widoczna w kontrolce obok, więc nie powtarzamy jej w tytule.
- `Sidebar.tsx:28`: „Dostęp do GitHub” → dynamiczne „Dostęp: {nazwa usługi}”.
- `index.html:7`: `<title>` **bez zmian** — produkt nazywa się „GitHub Access Lease Governor” (`PRODUKT.md`), a tytuł karty opisuje produkt, nie aktywną integrację.
- `useLeaseDecision` i pozostałe inwalidacje: nazwane klucze z prefiksem usługi + istniejące inwalidacje bez klucza bez zmian.

---

## 6. Reużycie zamiast duplikacji

Przy okazji tej zmiany **trzy istniejące kopie** `SELECT_CLASSES` (`AppealForm.tsx:21-22`, `GraphFilters.tsx:21-22`, `AuditFilters.tsx:25-26`) przenosimy do `src/lib/selectClasses.ts` jako jedną stałą `SELECT_CLASSES`, z której korzysta także `ServicePicker`. Powód: `CODING_STANDARDS.md` §1.2 wymaga jednego źródła prawdy dla wspólnych pomocników, a nowa kontrolka byłaby czwartą kopią.

---

## 7. Testy

Zgodnie z TDD: test przed kodem, w każdym kroku planu.

### 7.1 Frontend — rejestr i strażnik
- `serviceRegistry.test.ts`: każda usługa ma niepustą listę tras; `defaultRouteId` wskazuje istniejącą trasę; `isRouteSupported` rozróżnia `/audit` (obsługiwane przez obie) od `/leases` (tylko GitHub); `getDefaultPath` zwraca `/` dla usługi bez `leases`.
- `ServiceRouteGuard.test.tsx`: wejście na `/leases` przy aktywnej `demo-tracker` przekierowuje na `/`; wejście na `/audit` **nie** przekierowuje; wejście na `/leases` przy `github` renderuje treść.

### 7.2 Frontend — kontekst i trwałość
- `ServicesContext.test.tsx`: domyślna usługa to `github`; zapisany `demo-tracker` w `localStorage` jest odtwarzany; nieznany zapis degraduje do `github`; `localStorage` rzucający wyjątek nie wywala providera; `useActiveService` bez providera rzuca.
- Zapis wyboru trafia do `localStorage` po zmianie.

### 7.3 Frontend — kontrolka
- `ServicePicker.test.tsx`: ma dostępną nazwę „Usługa”; pokazuje ikonę aktywnej usługi; `userEvent.selectOptions` przełącza usługę (dokładnie ten scenariusz, dla którego odrzucono Radix `Select` — test jest dowodem, że decyzja się broni); wybór usługi bez obsługi bieżącej trasy przenosi na trasę domyślną.
- `TopBar.test.tsx` (nowy): prawa grupa zawiera kontrolkę i slot `time-travel-bar`; **`justify-between` nadal ma dwoje dzieci** (regresja układu).
- `Sidebar.test.tsx` (nowy): dla `github` sześć pozycji; dla `demo-tracker` dwie (`Pulpit`, `Audyt`).

### 7.4 Zgodność rejestrów (test krzyżowy)
- `api/services.test.ts`: **zbiór identyfikatorów tras w rejestrze frontendu musi być podzbiorem identyfikatorów, które backend przypisuje `github`** — rozjazd nazw jest błędem kompilacji/testu, nie pustą pozycją na demo.

### 7.5 Backend
- `tests/ports/test_service_registry.py`: rejestracja i odczyt; sortowanie po `id`; duplikat `id` podnosi `ValueError`; `all_services()` zwraca `github` i `demo-tracker`.
- `tests/api/test_services.py`: `GET /api/v1/services` → 200 i `list[ServiceRead]`; zawiera `github` z `kind == "vcs"` i `capabilities` równym sześciu identyfikatorom tras; zawiera `demo-tracker` z `is_available is False`; odpowiedź jest deterministyczna między wywołaniami.
- `tests/schemas/test_contract_is_fresh.py` — **musi przejść** po regeneracji; to on pilnuje, że `schema.json` i `types/api.ts` nadążają.
- `tests/adapters/`: `get_vcs_provider` bez argumentu zwraca adapter GitHuba (zgodność wsteczna); nieznany `service_id` → 404.

### 7.6 MSW i infrastruktura testów
- Nowy handler `GET /api/v1/services` w `test/msw/domains/services.ts`, dołączony w `handlers.ts`. **Wymagane**, bo `setup.ts:31` używa `onUnhandledRequest: 'error'` — brak handlera wywali każdy test, który zamontuje provider.
- `renderWithProviders.tsx`: drzewo zyskuje `ServicesProvider`. To zmiana dotycząca wszystkich 23 plików testowych, ale jednopunktowa; testy istniejące nie zmieniają asercji, bo domyślna usługa to `github` z pełnym zestawem tras.
- `App.test.tsx` i `App.integration.test.tsx` **nie zmieniają asercji** — przy domyślnym `github` nawigacja ma nadal sześć pozycji.

---

## 8. Kryteria akceptacji

1. `GET /api/v1/services` zwraca katalog z `github` (dostępny) i `demo-tracker` (niedostępny), posortowany po `id`.
2. `grep -rn "register(" backend/app/adapters` zwraca **dwa** trafienia — oba adaptery rejestrują się przez to samo publiczne API.
3. Pasek górny pokazuje kontrolkę z ikoną i nazwą usługi; ma dostępną nazwę „Usługa”; przełączenie działa przez `userEvent.selectOptions`.
4. Po przełączeniu na `demo-tracker` nawigacja ma dwie pozycje, a wejście na `/leases` przekierowuje na `/`; powrót na `github` przywraca sześć pozycji.
5. Wybór usługi przeżywa odświeżenie strony (`localStorage`).
6. Adresy tras pozostają niezmienione (`/leases`, nie `/github/leases`).
7. Bramki: `npm run typecheck`, `npm run lint`, `npm test -- --run`, `npm run build` — zielone; `cd backend && uv run pytest` — zielone; kontrakt zregenerowany i `test_contract_is_fresh.py` przechodzi.
8. Dokumentacja spójna: ADR 0014, `AGENTS.md`/`SKILLS.md` bez zmian, `frontend/DESIGN.md` z nową sekcją o kontrolce chrome (patrz §9).

---

## 9. Dokumentacja do aktualizacji

| Plik | Zmiana |
| --- | --- |
| `docs/adr/0014-wybor-uslugi-i-rejestr-dostawcow.md` **(nowy)** | Decyzja: płaskie trasy + gating przez rejestr usług, `localStorage` zamiast parametru trasy, rejestr backendu jako jawna lista, natywny `<select>`; alternatywy odrzucone (segment w ścieżce, discovery przez `entry_points`, Radix `Select`) |
| `frontend/DESIGN.md` | Nowa sekcja o kontrolce chrome: dopuszczalny rozmiar (`h-8`, `text-xs`), użycie `--primary` tylko dla zaznaczenia, zakaz drugiego przycisku `default` |
| `README.md` | Sekcja „Stan prac” + opis endpointu `GET /api/v1/services` |
| `frontend/README.md` | Nowy moduł `src/services/` i konwencja `localStorage` |

---

## 10. Ryzyka i mitygacje

| Ryzyko | Mitygacja |
| --- | --- |
| Dodanie `ServicesProvider` psuje 23 pliki testowe | Jednopunktowa zmiana w `renderWithProviders`; domyślna usługa `github` zachowuje sześć pozycji nawigacji, więc istniejące asercje przechodzą bez edycji |
| Brak handlera MSW → kaskada błędów (`onUnhandledRequest: 'error'`) | Handler `services` powstaje **w tym samym kroku** co provider, przed włączeniem providera do drzewa testów |
| Prefiks usługi w kluczach zapytań rozjeżdża inwalidacje | Inwalidacje nazwane dostają prefiks; inwalidacje bez klucza (czas, reset) pozostają poprawne i obejmują wszystkie usługi |
| Układ TopBar psuje się przez trzecie dziecko | Kontrolka i pasek czasu są w jednej prawej grupie; test regresyjny pilnuje, że `justify-between` ma dwoje dzieci |
| Rozjazd nazw tras frontend/backend | Test krzyżowy (§7.4) + identyfikatory tras jako `capabilities` |
| `localStorage` niedostępny (tryb prywatny) | Odczyt i zapis w `try/catch`; brak zapisu nie blokuje działania |
| Pozorny „wybór” przy jednej realnej usłudze | Druga usługa jest jawnie oznaczona jako demonstracyjna w `name` i w docstringu; spec mówi o tym wprost w §1 |

---

## 11. Poza zakresem (YAGNI)

- Drugi działający adapter (Jira/GitLab) i jego model danych.
- Izolacja danych per usługa i trasy w postaci `/api/v1/services/{id}/leases` — wymagałoby zmian w każdym module API, każdym handlerze MSW i każdym teście.
- Uprawnienia per usługa, logowanie, wielodostępność organizacji.
- Discovery przez `entry_points` / `importlib.metadata`.
- Prefiks usługi w adresie URL i linki do konkretnej usługi.
- Ikony marek pobierane z zewnątrz lub z dodatkowej biblioteki ikon (`DESIGN.md:117` dopuszcza wyłącznie `lucide-react`).
