# ADR 0011: Fixtures jako dane zgodne z generowanym kontraktem (`shared/fixtures`)

**Status:** Proponowany (do akceptacji zespołu) · **Autor:** Sydor (Osoba 6) · **Data:** 2026-10-03
**Doprecyzowuje:** ADR 0009, krok 6.1 planu zespołowego

## Kontekst

ADR 0009 ustanowił Pydantic jako źródło prawdy: schematy w `app/schemas/` są eksportowane do `backend/contract/schema.json`, a z niego generowane są typy TS w `frontend/src/types/api.ts`. Test `tests/schemas/test_contract_is_fresh.py` pilnuje świeżości.

Mimo tego Osoba 5 nie może zbudować tabeli dzierżaw (5.3), bo w `app/api/v1/` istnieje wyłącznie `demo.py` — endpointy pod widoki (3.6, 4.x) jeszcze nie powstały, więc nie wiadomo, jak wyglądają odpowiedzi. Bez zamrożonych danych frontend zgaduje kształt i przepisuje tabelę dwukrotnie.

Pierwsza próba podejścia do 6.1 (gałąź `osoba-6-scenariusze-testy-prelint`, wycofana) zakładała ręcznie pisany `api.schema.json` w `shared/fixtures/contract/`, nazwy w camelCase i `recommendation: "NONE"`. Okazało się to sprzeczne z realnym kontraktem: pola są w `snake_case`, a `Recommendation` to `KEEP | DOWNSCOPE | REVOKE`. Całość wyrzucono.

## Decyzja

1. **Fixtures są danymi zgodnymi z kontraktem, nie drugim kontraktem.**
   - Nie tworzymy żadnego równoległego schematu. Jedynym źródłem prawdy pozostają modele Pydantic z ADR 0009.

2. **Lokalizacja: `shared/fixtures/`** — poza `frontend/` i `backend/`, bo pliki czyta zarówno frontend (mock danych pod 5.3–5.10), jak i testy backendu.

3. **Kształt pliku fixtures:**
   - albo lista obiektów danego modelu (`[{...}, {...}]`),
   - albo pojedynczy obiekt (`{...}`).
   - Bez koperty paginacyjnej — patrz punkt 6.

4. **`manifest.json` wiąże plik z kontraktem:**
   - każdy wpis podaje `id`, `file`, `shape` (`list` albo `single`), `model` (nazwa z `$defs`, np. `LeaseOverview`) oraz `consumedBy` (np. `frontend:5.3`) i `status`.

5. **Walidacja przez modele Pydantic, nie przez JSON Schema.**
   - Test `backend/tests/contract/test_fixtures_match_contract.py` wczytuje fixtures i waliduje je tym samym modelem, który wygenerował kontrakt (`LeaseOverview.model_validate(item)`).
   - *Uzasadnienie:* zero nowych zależności (nie dodajemy `jsonschema` do backendu), a sprawdzenie jest silniejsze niż JSON Schema, bo używa dokładnie tego modelu, z którego ADR 0009 generuje typy TS.

6. **Koperta listy (`items` / `total`) świadomie odłożona (YAGNI).**
   - Żaden istniejący endpoint jej nie potrzebuje, a wprowadzenie jej wymagałoby modelu w `app/schemas/` autorstwa Osoby 1 i regeneracji kontraktu.
   - Gdy pojawi się endpoint z paginacją: dodajemy model w `app/schemas/`, regenerujemy kontrakt, **i dopiero wtedy** zmieniamy fixtures.

7. **Dane odwzorowują realny seed** z `app/db/seed_data.py`: `tomasz-admin`, `kamil`, `marta`, `nowy-dev` oraz 10 repozytoriów (`core-api`, `auth-service`, `payment-service`, `frontend-app`, `infra-terraform`, `notifications`, `mobile-app`, `data-pipeline`, `qa-automation`, `legacy-reports`).
   - Fixtures nie wymyślają własnej populacji — inaczej demo na fixtures i demo na API pokazywałyby dwie różne organizacje.

8. **Konsumpcja przez frontend: alias Vite `@shared` → `../shared`** wraz z `server.fs.allow: ['..']`. Fragment konfiguracji dostarcza `shared/fixtures/README.md`; podłączenie do `frontend/vite.config.ts` następuje po utworzeniu szkieletu SPA (5.1).

## Konsekwencje

- **Zalety**: jedno źródło prawdy dla kształtu danych, brak ryzyka dryfu nazw i enumów, brak nowych zależności, fixtures opisują realną organizację demo.
- **Ryzyko**: fixtures dla widoków bez endpointów (`leases`, `baseline`, `appeals`, `audit`) opisują kształt, którego jeszcze nikt nie zwraca — mogą wymusić na Osobie 3/4 decyzje, których nie podjęli. Mitygacja: walidacja modelem wykryje rozjazd natychmiast po dodaniu endpointu, a `manifest.json` niesie `consumedBy`, więc widać, które wpisy są wybiegające w przyszłość.
- **Odrzucone**: ręcznie pisany drugi schemat (poprzednia próba — rozjechała się z kontraktem), osobny projekt `tools/` (backend już istnieje, nie ma czego odblokowywać), koperta paginacyjna teraz (nikt jej nie potrzebuje).
