# Scenariusze demonstracyjne (`shared/scenarios`)

Pięć przypadków użycia z `PRODUKT.md` zapisanych jako **wykonywalne dane**
([ADR 0011](../../docs/adr/0011-scenariusze-demo-jako-dane.md)). To jedyne źródło prawdy:
z tych samych plików korzysta skrypt prezentacji (6.6) i testy end-to-end (6.3).

Sprawdzenie:

```bash
cd backend
.venv\Scripts\python.exe -m pytest tests/scenarios -q      # Windows
uv run pytest tests/scenarios -q                            # z uv
```

| Plik | Przypadek | Co pokazuje |
| --- | --- | --- |
| `uc-01-onboarding.json` | UC-1 | Standard zespołu DEV dla `nowy-dev` — bez `admin` |
| `uc-02-downscope.json` | UC-2 | `kamil@payment-service`: `write` bez pushów → `DOWNSCOPE` |
| `uc-03-appeal-flow.json` | UC-3 | Odwołanie `marta@qa-automation`, puste uzasadnienie → `422` |
| `uc-04-time-travel.json` | UC-4 | `ACTIVE` → `WARNING` → `EXPIRED` po +25 i +5 dniach |
| `uc-05-last-admin.json` | UC-5 | Drugi admin nadany akcją, potem `403` na ostatnim |

## Kształt scenariusza

```jsonc
{
  "id": "uc-02-downscope",
  "use_case": "UC-2",
  "title": "Deeskalacja write → read przy braku pushów",
  "given": {
    "anchor": "2026-10-03T00:00:00Z",   // czas odniesienia seeda (ADR 0008)
    "seed": "default",
    "relies_on": ["kamil", "payment-service"],  // loginy i repozytoria, na których opiera się scenariusz
    "note": "…"                          // dlaczego scenariusz wygląda tak, jak wygląda
  },
  "when": [ /* kroki */ ],
  "then": [ /* oczekiwania */ ]
}
```

`given` **nie deklaruje** dzierżaw ani zdarzeń. Deterministyczny seed z ADR 0008 już je produkuje,
a druga kopia rozjechałaby się przy pierwszej zmianie persony.

## Kroki `when`

| Krok | Znaczenie |
| --- | --- |
| `{"type": "reset"}` | `POST /api/v1/demo/reset` — każdy scenariusz zaczyna się od tego kroku, żeby nie zależał od poprzedniego |
| `{"type": "time_travel", "days": 25}` | `POST /api/v1/simulation/time-travel`; `days` w zakresie 1–365 (`TimeTravelRequest`) |
| `{"type": "api", "method", "path", "as"}` | Wywołanie i zapamiętanie odpowiedzi pod aliasem |

Krok `api` przyjmuje dodatkowo:

- `body` — treść żądania. Wartości zależne od kolejności seedowania nie są wpisywane na sztywno,
  tylko rozwiązywane:

  ```jsonc
  "lease_id": {
    "$from": "leases",                                              // alias wcześniejszego kroku
    "where": { "user.login": "marta", "repository.name": "qa-automation" },
    "field": "id"
  }
  ```

- `resolve` — podstawienie pod placeholder w `path`, np. `{"appeal_id": {"$from": "appeal", "field": "id"}}`
  dla `path: "/api/v1/appeals/{appeal_id}/decision"`.

Nieznany typ kroku musi zakończyć się `ValueError` z nazwą kroku — nie cichym pominięciem.

## Oczekiwania `then`

Dwa warianty:

```jsonc
// 1. Oczekiwanie na rekord modelu z kontraktu
{
  "target": "leases",              // alias z kroku when
  "model": "LeaseOverview",        // model z CONTRACT_RESPONSE_MODELS
  "where": { "user.login": "kamil", "repository.name": "payment-service" },
  "expect": { "status": "WARNING", "recommendation": "DOWNSCOPE", "days_remaining": 4 }
}

// 2. Oczekiwanie wyłącznie na wynik HTTP
{ "target": "remove-only-admin", "expect": { "status_code": 403 } }
```

Klucze w `expect` muszą być polami wskazanego modelu — literówka w nazwie pola jest błędem testu,
a nie cicho pominiętą asercją. `where` przyjmuje ścieżki z kropką (`repository.name`) i może być
pominięte, gdy krok zwraca pojedynczy obiekt.

## Czego scenariusze **nie** zawierają

- Zegara systemowego. `given.anchor` jest jawnym, konkretnym instantem, a przesunięcia idą przez
  `time_travel`. Dzięki temu ten sam scenariusz daje ten sam wynik dziś i za miesiąc.
- Roli `admin` w danych wejściowych. Seed nadaje admina wyłącznie `tomasz-admin`; przypadek
  „dwóch administratorów" w UC-5 powstaje **akcją**, żeby asercja `403` nie była pusta.
- Własnych dzierżaw i zdarzeń — patrz `given` powyżej.

## Dodawanie scenariusza

1. Dodaj `uc-NN-nazwa.json` w tym katalogu.
2. Użyj wyłącznie loginów z `app/db/seed_data.py` i repozytoriów z `REPOSITORIES`.
3. Uruchom `pytest tests/scenarios`. Pokrycie UC-1…UC-5, kolejność kroków, zgodność pól
   z kontraktem, zakres `days` i przynależność loginów sprawdzają się automatycznie.
