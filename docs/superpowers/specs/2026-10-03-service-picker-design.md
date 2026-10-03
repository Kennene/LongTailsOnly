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

Rejestrujemy **jedną realną usługę (GitHub)** oraz **jedną jawnie oznaczoną usługę demonstracyjną**. Nie budujemy drugiego działającego adaptera ani izolacji danych per usługa — patrz §11 „Poza zakresem”.

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
| „GitHub” zaszyty w trzech tekstach UI | `index.html:7`, `TopBar.tsx:12`, `Sidebar.tsx:28` — dwa z nich stają się dynamiczne, tytuł dokumentu zostaje (§5.7) |
| Klucze zapytań nie mają wymiaru usługi | `['leases']`, `['dashboard']`, `['graph']`, `['audit']`, `['appeals']`, `['clock']` |
| Bramki jakości: frontend zielony przed zmianą | typecheck 0 błędów, lint 0, **205 testów / 23 pliki**, build OK |
| Bramki jakości: backend **nie jest w pełni zielony** przed zmianą | Po rebase na `frontend-integration` `uv run pytest -q` → **417 passed, 3 failed**. Wszystkie trzy błędy są wcześniejsze i niezwiązane z tym zadaniem (§2.1). Liczby „398/2” z pierwotnej wersji tego dokumentu są **nieaktualne** — patrz §2.1 |

> **Uwaga środowiskowa (worktree agenta):** `uv` nie ma dostępu do `~/.cache/uv` w sandboxie. Testy backendu uruchamiamy z `UV_CACHE_DIR=<repo>/.uv-cache`, katalog już istnieje w repozytorium i jest ignorowany przez git. Bez tego `uv run` kończy się `Failed to initialize cache`.

**Trzy decyzje w kodzie, które wiążą ten projekt:**

1. **Radix `Select` został odrzucony trzykrotnie** — `AppealForm.tsx:19-22`, `GraphFilters.tsx:19-22`, `AuditFilters.tsx:23-26`: nie przyjmuje `userEvent.selectOptions` i wymaga polyfilli w jsdom. `components/ui/select.tsx` ma **zero importerów**. Nowa kontrolka nie może być czwartym wyjątkiem.
2. **`--primary` jest zarezerwowany** dla „akcji głównej, zaznaczenia i fokusu” (`DESIGN.md:52`), więc oznaczenie aktywnej usługi tym kolorem jest zgodne z systemem, ale kontrolka nie może stać się drugim przyciskiem `default`.
3. **Chrome nigdy nie przekracza `text-sm`** (`DESIGN.md:68`), a dolna granica `text-xs` ma tylko dwa wyjątki (`DESIGN.md:70`).

### 2.1 Wcześniejsze błędy backendu (nie należą do tego zadania)

Na bazowym commicie `b6b6124` `uv run pytest -q` dawało **398 passed, 2 failed**. **Po rebase na `frontend-integration` (`c7c56f0`) licznik to 417 passed / 3 failed**, bo gałąź gospodarza wniosła trzeci, niezależny błąd. Żaden z tych trzech nie należy do tego zadania:

| Test | Przyczyna |
| --- | --- |
| `tests/repo/test_docs_integrity.py::test_adr_numbers_are_unique` | Numery ADR kolidują: `0010` istnieje dwa razy (`0010-frontend-navigation-and-data-layer.md` i `0010-github-mock-activity-types-and-time-travel-api.md`) oraz `0011` dwa razy (`0011-fixtures-zgodne-z-generowanym-kontraktem.md` i `0011-person-4-baseline-appeals-audit-insights.md`) |
| `tests/repo/test_docs_integrity.py::test_every_adr_file_is_listed_in_index` | `docs/adr/README.md` indeksuje nowsze pliki pod 0010/0011, a starsze pliki o tych numerach leżą na dysku nieindeksowane. `docs/adr/README.md:13` wprost opisuje kolizję 0010 |

| `tests/contract/test_fixtures_match_contract.py::test_lease_fixtures_cover_all_statuses_roles_and_recommendations` | Test przypina zbiór statusów fixture'ów jako `{ACTIVE, WARNING, EXPIRED}`, a `shared/fixtures/leases.json` zawiera też `PERMANENT`. Wprowadzone przez `f9c9c55` („docs(data): record the shared-data drift…"), który jest przodkiem **zarówno `main`, jak i tej gałęzi**, a pliki fixture'ów są bajtowo identyczne między `frontend-integration` i `HEAD` — czyli błąd jest wcześniejszy i **nie należy do tego zadania**. Należy do właściciela silnika dzierżawy: albo test ma znać `PERMANENT`, albo fixture ma go nie zawierać. |

**Konsekwencje dla tego zadania:**

1. **Kryterium akceptacji nie może brzmieć „cały `pytest` zielony”.** Brzmi: „brak **nowych** błędów; liczba błędów pozostaje 2”.
2. **Numer naszego ADR to `0017`** — najniższy wolny **na zmergowanym `main`**. Po rebase na `origin/main` numeracja gospodarza jest ciągła `0001–0016` (kolizje 0010/0011 zostały u nich uporządkowane, a `0014` należy do Osoby 4), więc `0017` jest pierwszą wolną liczbą.
3. **Nie naprawiamy kolizji ADR-ów w tym zadaniu.** To osobna zmiana dotycząca cudzych dokumentów i indeksu; dopisanie jej tutaj rozdmuchałoby zakres (YAGNI, `CODING_STANDARDS.md` §1.5). Odnotowujemy i zostawiamy.

---

## 3. Decyzje architektoniczne

1. **Wybierana jest usługa, nie organizacja.** Jedna aktywna usługa naraz; przełączenie zmienia zbiór dostępnych widoków. Osadza się to na istniejącym porcie `VCSProvider`.
2. **Trasy zostają płaskie.** `/`, `/leases`, `/appeals`, `/baseline`, `/graph`, `/audit` bez prefiksu usługi. Gating polega na tym, że usługa **deklaruje obsługiwane trasy**; nieobsługiwana trasa przekierowuje na trasę domyślną tej usługi.
3. **Stan wybranej usługi jest kliencki i trwały między odświeżeniami** — `localStorage` pod kluczem `lease-governor.service`. **Nie używamy parametru zapytania ani segmentu ścieżki**, żeby nie zmienić kształtu istniejących adresów (205 testów i scenariusze demo polegają na `/leases` itd.).
4. **Klucze zapytań zyskują prefiks usługi:** `['leases']` → `['leases', serviceId]`. Inwalidacja bez klucza (podróż w czasie, reset demo — `useTimeTravel.ts:12`, `useDemoReset.ts:13`) pozostaje poprawna, bo unieważnia cały cache. `['clock']` zostaje globalny — zegar nie należy do usługi, a `['services']` globalny, bo to właśnie to zapytanie ustala wartość, od której zależałby prefiks.
   **Bramka odczytu (dopisane po zadaniu 8, Ruling 28a/30/31; poprawione po Ruling 35):** osiem czytników ma `enabled: !isPending && activeService.id !== ''`. Milczący katalog rozstrzyga się z rejestru frontendu (Ruling 35, §5.2), więc `activeService.id` jest **niepuste** już w trakcie oczekiwania — z zapisanym wyborem albo, gdy go nie ma, z domyślnym `github`; bez `!isPending` każdy czytnik otwierałby więc zapytanie przed potwierdzeniem katalogu, malował treść, a po jego dotarciu przełączenie klucza **zastępowało** tę treść — jedno zmarnowane żądanie i widoczny błysk treści na każdy zasób przy każdym zimnym starcie. Druga połowa (`id !== ''`) obejmuje katalog, który osiadł **pusty**: to wypowiedź, więc nie ma usługi, której można by przypisać dane. Bramka nie jest `!isError`: gdy katalog zawiedzie, rozstrzyga rejestr (Ruling 25 i 35) i treść tej usługi **ma** zostać pobrana — `!isError` blokowałoby też prawdziwy identyfikator. Warunkiem jest więc „czy mamy usługę, której można przypisać te dane”, a nie „czy katalog odpowiedział”.
   **Cena, nazwana wprost:** przy zimnym starcie pierwsze żądanie **czeka na katalog**. `main.tsx` nie ustawia limitu czasu zapytania, więc katalog, który **wisi** (a nie zawiódł), zostawia widoki usługowe na szkieletach — tam, gdzie dosłowne przełączenie klucza pokazałoby dane; nawigacja i kontrolka działają wtedy dalej, bo rozstrzyga je rejestr frontendu (Ruling 35). Uznajemy to za właściwy kompromis: katalog może jeszcze zdegradować identyfikator, a pobieranie pod identyfikatorem, który zaraz zostanie unieważniony, to dokładnie ten błysk, który bramka usuwa. Katalog, który **padł**, bramki nie zamyka: rejestr jest wtedy jedynym autorytetem, więc dane domyślnego `github` (albo usługi wybranej w tym oknie — Ruling 25) się pobierają.
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

`ServiceRead` trafia do `CONTRACT_RESPONSE_MODELS` w `app/schemas/__init__.py`. **Konsekwencja obowiązkowa:** po tej zmianie trzeba wygenerować kontrakt i typy TS — `uv run python scripts/export_contract.py`, a potem `json-schema-to-typescript` (dokładne polecenie w `backend/README.md`) — inaczej `tests/schemas/test_contract_is_fresh.py` pada (§7.5).

---

## 5. Rejestr usług — frontend

### 5.1 Moduł `src/services/serviceRegistry.ts`

Pojedyncze źródło prawdy dla UI: trasa, etykieta nawigacji i ikona per usługa.

```ts
export type ServiceRouteId = 'dashboard' | 'leases' | 'appeals' | 'baseline' | 'graph' | 'audit';
export type ServiceIconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export interface ServiceRoute {
  id: ServiceRouteId;
  path: string;      // '/' | '/leases' | ...
  label: string;     // 'Pulpit' | 'Dzierżawy' | ...
  icon: ServiceIconComponent;
}

export interface ServiceConfig {
  id: string;
  icon: ServiceIconComponent;
  routes: ServiceRoute[];
  defaultRouteId: ServiceRouteId;
}
```

**Identyfikatory usług są zwykłym `string`iem** — alias `ServiceId` nie jest potrzebny, dopóki nie ma konsumenta, który by na nim zyskiwał (YAGNI, `CODING_STANDARDS.md` §1.5). `ServiceIconComponent` pozostaje szeroki (`aria-hidden?: boolean`), bo obie implementacje — lucide i nasze znaki — i tak renderują atrybut na sztywno jako `"true"`; wymuszanie tego typem kolidowałoby z `LucideProps` bez realnej korzyści. Wszystkie ikony w rejestrze są dekoracyjne: nazwę zawsze niesie sąsiedni tekst.

Eksporty: `SERVICE_REGISTRY`, `getServiceConfig(id)`, `getDefaultPath(id)`, `isRouteSupported(id, path)`, `fallbackIcon`.

**Znaki firmowe:** `src/services/brandIcons.tsx` z `GitHubIcon`, `GitLabIcon` (własne `SVG` z `viewBox="0 0 24 24"`, `fill="currentColor"`, `aria-hidden="true"`, `className` przekazywane tak jak w lucide, oraz **`width`/`height` ustawione na `1em`**, żeby znak bez `className` nie rozlał się do domyślnych 300×150 elementu zastępowanego). Rejestr używa `GitHubIcon` dla `github`. **`GitLabIcon` celowo nie jest przypisany do `demo-tracker`** — to znak zarezerwowany dla przyszłego adaptera GitLaba (§11), a `demo-tracker` jest z definicji „integracją demonstracyjną" typu issue tracker, więc noszenie marki GitLaba wprowadzałoby w błąd. Świadomie nieużywany eksport nie jest martwym kodem; dla nieznanej usługi służy `fallbackIcon` (lucide `Blocks`).

**Dwa rejestry:** `github` (pełna lista sześciu tras, `defaultRouteId: 'dashboard'`) i `demo-tracker` (`dashboard` + `audit`, `defaultRouteId: 'dashboard'`, ikona `fallbackIcon`). Trasy współdzielone (`dashboard`, `audit`) są zdefiniowane **raz** i reużywane przez oba wpisy — bez duplikowania etykiet i ikon.

**Dwa warunki, które muszą zachodzić łącznie.** Obydwa wynikły z przeglądu zadania 4 — pierwszy był realnym defektem projektu (pusty ekran), drugi regresją adresów, które dziś działają — i obydwa są przypięte testami:

1. **Dopasowanie trasy musi odpowiadać semantyce React Routera, nie porównaniu znak-w-znak.** `isRouteSupported` normalizuje ścieżkę przed porównaniem: usuwa końcowy `/` (poza samym `/`) i ignoruje wielkość liter. React Router 7 dopasowuje `/leases/` oraz `/Leases` do trasy `/leases` (`caseSensitive` domyślnie `false`), więc naiwne porównanie ścisłe kazałoby strażnikowi przekierować adresy, które **dziś renderują widok** — cicha zmiana routingu, nie kosmetyka.
2. **Strażnik nie może odrzucać własnego celu przekierowania.** Dla usługi nieznanej rejestrowi frontendu `getDefaultPath` zwraca `/`, więc `isRouteSupported(id, '/')` musi być `true`. Inaczej `<Navigate>` prowadzi na ścieżkę, którą ten sam predykat odrzuca, `<Outlet/>` nigdy się nie renderuje i powłoka zostaje pusta — dokładnie ten scenariusz, dla którego istnieją `fallbackIcon` i `getServiceConfig → undefined`. Niezmiennik przypięty testem: `isRouteSupported(id, getDefaultPath(id)) === true` dla dowolnego `id`, w tym `'does-not-exist'`, `'toString'` i `'constructor'`.

### 5.2 Kontekst i stan — `src/services/ServicesContext.tsx`

- `ServicesProvider` wykonuje `useServices()` (TanStack Query), rozwiązuje aktywną usługę i wystawia `ServiceContextValue { activeService, services, setActiveService, isPending, isError }`.
- Odczyt zapisanej usługi: leniwa inicjalizacja `useState` czytająca `localStorage` (klucz `lease-governor.service`), z walidacją wobec rejestru i katalogu z backendu.
- Zapis: **w setterze `setActiveService`**, nie w `useEffect` przy zmianie aktywnej usługi — efekt nadpisywałby nieznany zapis wartością zastępczą i gubił wybór, którego katalog jeszcze nie potwierdził. Odczyt/zapis `localStorage` w `try/catch` — prywatny tryb przeglądarki nie może wywalić panelu (`DESIGN.md:137`).
- Kolejność rozstrzygania aktywnej usługi: zapis obecny w katalogu → `github` z katalogu → pierwszy wpis katalogu → placeholder. Gdy katalog **milczy** (żądanie w drodze albo padło), rozstrzyga rejestr frontendu: najpierw zapisany identyfikator, a gdy zapisu nie ma albo rejestr go nie zna — domyślny `github` (Ruling 35). Dzięki temu pierwsza wizyta i cała sesja z padniętym katalogiem mają nawigację (trasy `github`), a powłoka nie ogłasza „Brak usług”, skoro kontrolka obok oferuje `github`.
- Wybór nieistniejącej usługi jest ignorowany, a użytkownik wraca do domyślnej (`github`) — **dokładne reguły, z rozróżnieniem trzech stanów katalogu, opisuje §5.6.1**.
- **Gdy katalog z backendu nie zawiera zapisanej usługi** (np. integracja wyrejestrowana), provider wybiera pierwszą dostępną i **nie** kasuje zapisu po cichu — zapis zostaje, wybór degraduje się na czas sesji. Katalog **osiadły** — także pusty — jest jedynym autorytetem: rejestr go nie przebija, a pusty katalog daje placeholder.

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
if (!isPending && !isRouteSupported(activeService.id, location.pathname)) return <Navigate to={getDefaultPath(...)} replace />;
return <Outlet />;
```

Przekierowanie jest **deklaratywne** (`<Navigate>`), nie w `useEffect` — brak migotania treści i brak podwójnego renderu. Trasy pozostają zadeklarowane w `App.tsx`; strażnik tylko je bramkuje. Warunek `!isPending` istnieje dlatego, że w trakcie oczekiwania na katalog identyfikator pochodzi z rejestru frontendu i katalog może go jeszcze zmienić — przekierowanie na tej podstawie wyrzuciłoby użytkownika z trasy, którą docelowa usługa jednak obsługuje. Wyjątkiem jest katalog osiadły **pusty**: wtedy aktywny jest placeholder, którego jedyną obsługiwaną trasą jest pulpit, więc strażnik nigdy nie odrzuca własnego celu przekierowania i nie zapętla się.

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
- `<select className="h-8 rounded-lg border border-input py-1 pr-7 pl-2 text-xs">` — tło pochodzi ze wspólnego rdzenia (`bg-transparent`), **bez własnego `appearance-none`**; przy dyskretnym rozmiarze natywna strzałka zapewnia afordancję bez nowej zależności.
- Ikona: `<span className="text-muted-foreground"><ActiveIcon className="size-4" aria-hidden="true" /></span>`.
- Opcje renderują `name` z backendu, a przy `is_available === false` dopisek `(niedostępna)`.
- Zapisany wybór, którego nie ma w katalogu, dochodzi jako opcja „(nieznana)” — użytkownik widzi prawdę zamiast pustego pola.

**Brak stanu ładowania jako spinnera:** zanim katalog dotrze, kontrolka renderuje się z rejestru frontendu (znane wpisy), a `aria-busy` jest ustawiane w trakcie. To zgodne z regułą „nigdy spinner w środku treści” (`DESIGN.md:98`) i nie blokuje szkieletu.

### 5.6 Zachowanie przy przełączeniu

1. Bieżąca trasa jest obsługiwana przez usługę docelową → **zostań na trasie** (np. `/audit` działa w obu).
2. Bieżąca trasa nie jest obsługiwana → przejdź na `defaultRouteId` usługi docelowej.
3. Pozostałe parametry zapytania są zachowywane.

#### 5.6.1 Kiedy wybór jest przyjmowany, a kiedy odrzucany

Punkt „usługa docelowa nie istnieje w katalogu → ignoruj” **nie wystarcza**, bo katalog bywa w trzech różnych stanach naraz, a każdy znaczy co innego: *jeszcze nie wiemy* (żądanie w locie), *wiemy i nie ma tam tej usługi* (katalog osiadł), *nie dowiemy się* (żądanie padło). Zapisanie tej różnicy wprost jest konieczne — bez tego nie da się rozstrzygnąć, czy klik w trakcie ładowania ma być przyjęty, i łatwo o martwy klik na widocznej opcji.

Reguła (dokładnie ta kolejność):

```ts
const isInCatalog = services.some((service) => service.id === id);
const isInRegistry = getServiceConfig(id) !== undefined;
const isSelectable = isInCatalog || (isInRegistry && (isPending || isError));

if (!isSelectable) {
  return;
}
```

Trzy konsekwencje, każda pokryta testem:

1. **Katalog jest rozstrzygający, gdy jest znany.** Usługa obecna w osiadłym katalogu jest wybieralna **także wtedy, gdy rejestr frontendu jej nie zna** — to katalog jest źródłem opcji w kontrolce, więc taki wpis jest widoczny i klikalny, a nieznajomość w rejestrze degraduje się łagodnie (`fallbackIcon`, `getDefaultPath → '/'`, Ruling 12), a nie wygaszeniem powłoki. Odwrotnie: osiadły katalog, który **pomija** wpis rejestru (np. nie zawiera `github`), rozstrzyga na jego niekorzyść — wybór jest odrzucany.
2. **W trakcie ładowania przyjmujemy** (dla id z rejestru) i zapisujemy. Katalog jeszcze się nie wypowiedział, a kontrolka celowo renderuje wpisy rejestru już w tym oknie — inaczej klik w widoczną opcję byłby martwy. Rozstrzygnięcie i tak odrzuci nieznane id, więc nic niezweryfikowanego nie zostaje aktywne.
3. **Po błędzie żądania przyjmujemy id z rejestru frontendu** — i **przełączenie musi faktycznie zadziałać**, a nie tylko zapisać się w `localStorage`. To znaczy, że rozstrzyganie aktywnej usługi również musi spaść do rejestru frontendu, gdy katalog się nie wypowiedział — do przyjętego identyfikatora, a gdy żadnego nie ma, do domyślnego `github` (Ruling 35); inaczej kontrolka renderuje klikalne opcje, klik jest przyjmowany, a widok dalej pokazuje usługę zastępczą — czyli martwy klik, który właśnie ta sekcja ma wykluczyć. Rozróżnienie jest istotne: **katalog, który osiadł jako pusty, NIE spada do rejestru** (placeholder zostaje), bo pusty katalog to wypowiedź, a nie brak wypowiedzi. Ten drugi przypadek jest przypięty testem i nie wolno go przy okazji zepsuć.

**Czego ta reguła świadomie nie robi:** nie wymaga obecności w rejestrze frontendu jako warunku koniecznego wyboru. Taki warunek („poza rejestrem nie jest wybieralne nigdy”) byłby **martwym klikiem** dla usługi, którą backend właśnie ogłosił w katalogu, a kontrolka renderuje ją jako opcję — czyli dokładnie ten defekt, którego cała ta sekcja ma unikać. Uzasadnienie „takiego id nie da się kliknąć” jest błędne: zbiór opcji to *katalog ∪ rejestr*, więc id z samego katalogu **jest** klikalny.

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

**Zaimplementowane w `api/services.test.ts`.** Test **wylicza** oczekiwany zbiór z `servicesFixture` — wspólnego, walidowanego modelem Pydantic pliku `shared/fixtures/services.json` — a nie z drugiego literału:

```ts
const github = servicesFixture.find((s) => s.id === 'github');
expect(new Set(github.capabilities)).toEqual(
  new Set(SERVICE_REGISTRY.github.routes.map((r) => r.id)),
);
```

Dzięki temu rejestr frontendu i dane, na których pracuje backend, mają **jedno współdzielone źródło** zamiast dwóch ręcznie utrzymywanych list. Rozjazd nazw jest błędem testu, nie pustą pozycją na demo.

**Granica tej gwarancji, nazwana wprost:** test porównuje rejestr frontendu z *fixture'em*, a nie z żywym backendem — fixture jest zapisem ręcznym, walidowanym co do **kształtu** (`tests/contract/test_fixtures_match_contract.py`) i co do **wartości** tylko przez `backend/tests/api/test_services.py`, które przypina literał sześciu capabilities. Łańcuch jest więc: backend pinuje wartości → fixture je odzwierciedla → rejestr frontendu jest z nimi porównywany. Pełne porównanie z żywym API wymagałoby uruchomionego backendu w testach frontendu, co jest poza zakresem (YAGNI).

### 7.5 Backend
- `tests/ports/test_service_registry.py`: rejestracja i odczyt; sortowanie po `id`; duplikat `id` podnosi `ValueError`; `all_services()` zwraca `github` i `demo-tracker`.
- `tests/api/test_services.py`: `GET /api/v1/services` → 200 i `list[ServiceRead]`; zawiera `github` z `kind == "vcs"` i `capabilities` równym sześciu identyfikatorom tras; zawiera `demo-tracker` z `is_available is False`; odpowiedź jest deterministyczna między wywołaniami.
- `tests/schemas/test_contract_is_fresh.py` — **musi przejść** po regeneracji; to on pilnuje, że `schema.json` i `types/api.ts` nadążają. Jest to jedyny test, który realnie wyłapie pominięcie regeneracji, więc uruchamiamy go jawnie, a nie tylko w całości suite.
- `tests/repo/test_docs_integrity.py` — po rebase na `origin/main` kolizje numerów ADR-ów **zniknęły u gospodarza**, więc ten test może być zielony; sprawdzamy nazwy, nie liczbę. Nowy ADR dostaje numer `0017` i **musi** zostać dopisany do `docs/adr/README.md`, inaczej `test_every_adr_file_is_listed_in_index` wskaże brakujący plik.
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
7. Bramki: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test -- --run`, `npm run build` — zielone. Backend: `UV_CACHE_DIR=<repo>/.uv-cache uv run pytest -q` → **417 + N passed, dokładnie 3 failed**, i to **te same trzy nazwane błędy wcześniejsze** z §2.1. Kryterium jest nazwane, nie liczbowe: **żaden nowy failing test**. Liczby bezwzględne starzeją się razem z gałęzią gospodarza — dwa razy w tym zadaniu okazały się nieaktualne, więc porównujemy zbiór nazw, nie samą liczbę. `tests/schemas/test_contract_is_fresh.py` przechodzi.
8. Dokumentacja spójna: ADR 0017, `AGENTS.md`/`SKILLS.md` bez zmian, `frontend/DESIGN.md` z nową sekcją o kontrolce chrome (patrz §9).

---

## 9. Dokumentacja do aktualizacji

| Plik | Zmiana |
| --- | --- |
| `docs/adr/0017-wybor-uslugi-i-rejestr-dostawcow.md` **(nowy)** | Decyzja: płaskie trasy + gating przez rejestr usług, `localStorage` zamiast parametru trasy, rejestr backendu jako jawna lista, natywny `<select>`; alternatywy odrzucone (segment w ścieżce, discovery przez `entry_points`, Radix `Select`). **Numer 0017 — najniższy wolny po rebase** (§2.1) |
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
| Rozjazd nazw tras frontend/backend | Test krzyżowy (§7.4) porównujący rejestr frontendu ze wspólnym fixture'em + identyfikatory tras jako `capabilities`; granica gwarancji opisana w §7.4 |
| `localStorage` niedostępny (tryb prywatny) | Odczyt i zapis w `try/catch`; brak zapisu nie blokuje działania |
| Pozorny „wybór” przy jednej realnej usłudze | Druga usługa jest jawnie oznaczona jako demonstracyjna w `name` i w docstringu; spec mówi o tym wprost w §1 |
| Wcześniejsze błędy backendu zagłuszają sygnał z bramki (dwa w `test_docs_integrity`, jeden w `test_fixtures_match_contract`) | Kryterium brzmi „żaden **nowy** failing test”, nie „zero failed” ani stała liczba (§2.1); przy weryfikacji porównujemy **zbiór nazw** testów, nie sam kod wyjścia. Liczby bezwzględne okazały się nieaktualne dwukrotnie, więc nie są kryterium |

---

## 11. Poza zakresem (YAGNI)

- Drugi działający adapter (Jira/GitLab) i jego model danych.
- Izolacja danych per usługa i trasy w postaci `/api/v1/services/{id}/leases` — wymagałoby zmian w każdym module API, każdym handlerze MSW i każdym teście.
- Uprawnienia per usługa, logowanie, wielodostępność organizacji.
- Discovery przez `entry_points` / `importlib.metadata`.
- Prefiks usługi w adresie URL i linki do konkretnej usługi.
- Ikony marek pobierane z zewnątrz lub z dodatkowej biblioteki ikon (`DESIGN.md:117` dopuszcza wyłącznie `lucide-react`).
