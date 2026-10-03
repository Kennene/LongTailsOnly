# Fixtures API (`shared/fixtures`)

Zamrożone dane, na których frontend może budować widoki zanim powstaną endpointy pod te widoki.
Fixtures **nie są drugim kontraktem** — są danymi zgodnymi z kontraktem generowanym z Pydantic
([ADR 0009](../../docs/adr/0009-api-contract-typescript-generation.md),
[ADR 0010](../../docs/adr/0010-fixtures-zgodne-z-generowanym-kontraktem.md)).

Źródło prawdy kształtu: `backend/contract/schema.json`, generowany z `backend/app/schemas/`.
Każdy plik jest walidowany **tym samym modelem Pydantic**, który generuje kontrakt:

```bash
cd backend
.venv\Scripts\python.exe -m pytest tests/contract -q      # Windows
uv run pytest tests/contract -q                            # z uv
```

Zmiana nazwy pola albo wartości enuma w `app/schemas/` natychmiast wywala ten test.

## Konsumpcja z frontendu

Alias Vite wskazuje katalog wspólny, żeby importy nie wychodziły poza `frontend/`:

```ts
// frontend/vite.config.ts
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../shared') },
  },
  server: {
    fs: { allow: ['..'] },
  },
})
```

```ts
import leases from '@shared/fixtures/leases.json'
import type { LeaseOverview } from '@/types/api'

const rows = leases as LeaseOverview[]
```

Typy pochodzą z `frontend/src/types/api.ts`, który jest **generowany** — nie edytujemy go ręcznie
(ADR 0009).

## `manifest.json`

Spis treści fixtures. Każdy wpis ma pola:

| Pole | Znaczenie |
| --- | --- |
| `id` | Identyfikator wpisu, używany w testach |
| `file` | Nazwa pliku w tym katalogu |
| `shape` | `list` (tablica rekordów) albo `single` (jeden obiekt) |
| `model` | Nazwa modelu z `$defs` w `schema.json`, np. `LeaseOverview` |
| `kind` | `response` albo `request` |
| `consumedBy` | Kto czyta ten plik, np. `frontend:5.3` — pozwala ocenić, co jest wybiegające w przyszłość |
| `status` | `provisional` dopóki endpoint nie istnieje; `stable` po potwierdzeniu na prawdziwym API |

Nie ma koperty paginacyjnej (`items` / `total`). Lista to po prostu tablica rekordów — żaden
istniejący endpoint nie ma paginacji. Gdy któryś będzie jej potrzebował, model koperty powstaje
w `app/schemas/` (Osoba 1), kontrakt się regeneruje, a fixtures zmieniają się **po** tym.

## Skąd pochodzą dane

Odwzorowują realny seed z `backend/app/db/seed_data.py`: `tomasz-admin`, `kamil`, `marta`,
`nowy-dev`, 10 deweloperów DEV, 5 QA i 10 repozytoriów organizacji `longtails`.
Daty i liczby dni pochodzą z faktycznie zaseedowanej bazy, nie z oszacowań.

Zbiór dzierżaw jest **reprezentatywny (15 z 53)**, a nie pełnym zrzutem bazy — pokrywa każdy
status, każdą rolę i każdą rekomendację. Tabela w panelu ma obsłużyć listę dowolnej długości,
więc 15 rekordów wystarczy do zbudowania i przetestowania widoku.

## Semantyka `days_remaining` — do potwierdzenia przez Osobę 3

`LeaseOverview.days_remaining` jest typu `int | None`. Z realnych danych wynikają trzy przypadki:

| Przypadek | `expires_at` | `days_remaining` | Przykład |
| --- | --- | --- | --- |
| Dzierżawa z terminem | ISO-8601 | liczba dodatnia | `kamil@core-api` → `28` |
| Dzierżawa wygasła | ISO-8601 (w przeszłości) | **liczba ujemna** | `kamil@legacy-reports` → `-61` |
| Stały admin (break-glass) | `null` | `null` | `tomasz-admin@core-api` |

Wartości ujemne **nie są przycinane do zera** — odpowiadają naturalnemu wynikowi
`(expires_at - now).days` i pokazują, jak dawno dzierżawa wygasła. `null` jest zarezerwowane
wyłącznie dla dzierżaw bez terminu, więc `days_remaining is None` ⇔ `expires_at is None`.

Panel powinien kluczować po polu `status`, a nie po znaku `days_remaining`.
Jeżeli Osoba 3 zdecyduje inaczej (np. przycięcie do zera), trzeba zaktualizować fixtures
i ten dokument w tym samym PR-ze.

## Jak dodać fixtures

1. Dodaj plik `nazwa.json` w tym katalogu — tablicę rekordów albo pojedynczy obiekt.
2. Dopisz wpis do `manifest.json` z `model` istniejącym w `schema.json`.
3. Uruchom `pytest tests/contract`. Walidacja, spójność odwołań między plikami i brak BOM
   sprawdzają się automatycznie — nowy wpis dostaje walidację bez pisania nowego testu.

Jeżeli `model` nie istnieje w kontrakcie, to nie jest brakująca fixtures, tylko brakujący
schemat — najpierw model w `app/schemas/` i regeneracja kontraktu.
