# Architecture Decision Records

Indeks decyzji architektonicznych projektu **GitHub Access Lease Governor**.
Każdy nowy ADR musi zostać dopisany do tabeli poniżej — pilnuje tego test `backend/tests/repo/test_docs_integrity.py`.

Proces podejmowania i pilnowania decyzji opisuje [ADR 0013](0013-prelint-i-straz-adr-w-procesie-pr.md).
Przed utworzeniem nowego ADR-a sprawdź `origin/main`, żeby nie powtórzyć numeru:

```bash
git ls-tree -r --name-only origin/main -- docs/adr
```

> **Uwaga o kolizji 0010.** Numer 0010 został nadany równolegle na dwóch gałęziach: Osoba 2 opisała
> nim mock GitHuba, a Osoba 6 — fixtures. Git tego nie wykrył, bo nazwy plików były różne, więc przy
> scaleniu oba pliki trafiły na `main` obok siebie. Kolizję znalazł test
> `test_adr_numbers_are_unique` w `backend/tests/repo/test_docs_integrity.py`.
> Rozstrzygnięcie: numer zachowuje ADR, który pierwszy trafił na `main` i jest przywoływany
> z kodu produkcyjnego (`app/domain/roles.py`, `enums.py`) — trzy ADR-y Osoby 6 przesunięto na 0011–0013.
>
> **Druga kolizja (0010 i 0011).** Po tej poprawce na `main` trafiły jeszcze ADR frontendu (0010) i Osoby 4 (0011),
> nadane równolegle. Ta sama reguła: 0010 i 0011 zostają przy wcześniejszych ADR-ach, Osoba 4 przechodzi na **0014**,
> frontend na **0015** (odwołania w kodzie i dokumentacji zaktualizowane).

| Nr | Tytuł | Status | Dotyczy |
| --- | --- | --- | --- |
| [0001](0001-tech-stack-and-spa-architecture.md) | Wybór stosu technologicznego i architektury SPA | Accepted | Backend, Frontend, komunikacja |
| [0002](0002-zero-standing-privileges-and-lease-hierarchy.md) | Model dzierżawy dostępu i hierarchia uprawnień (MVP) | Accepted | Domena, `write`/`read`, `admin` break-glass |
| [0003](0003-simulated-clock-and-time-travel.md) | Zegar symulowany (`TimeProvider`) i sterowanie czasem | Accepted | Zegar, `time-travel` |
| [0004](0004-github-mock-and-last-admin-protection.md) | Emulacja GitHub REST API i reguła Last Admin Protection | Accepted | `api/github_mock`, kody HTTP |
| [0005](0005-team-baseline-and-intentional-friction.md) | Standard zespołu i elastyczne decyzje administratora | Accepted | `BaselineService`, odwołania, TTL |
| [0006](0006-role-model-and-github-permission-mapping.md) | Model ról i mapowanie uprawnień GitHuba | Proponowany | `app/domain/enums.py` |
| [0007](0007-data-model.md) | Model danych | Proponowany | `app/models/`, migracje Alembic |
| [0008](0008-time-provider-api-seed-and-demo-reset.md) | Interfejs TimeProvider, deterministyczny seed i reset demo | Proponowany | `get_current_time()`, seed, `/demo/reset` |
| [0009](0009-api-contract-typescript-generation.md) | Kontrakt API — Pydantic jako źródło prawdy, typy TS generowane | Proponowany | `contract/schema.json`, `frontend/src/types/api.ts` |
| [0010](0010-github-mock-activity-types-and-time-travel-api.md) | Mock GitHuba: typy aktywności tylko dla mocka i API time-travel | Proponowany | `app/domain/github_events.py`, `roles.py`, kroki 2.4–2.5 |
| [0011](0011-fixtures-zgodne-z-generowanym-kontraktem.md) | Fixtures jako dane zgodne z generowanym kontraktem | Proponowany | `shared/fixtures/`, krok 6.1 |
| [0012](0012-scenariusze-demo-jako-dane.md) | Scenariusze demonstracyjne jako wykonywalne dane | Proponowany | `shared/scenarios/`, UC-1…UC-5, kroki 6.2 i 6.3 |
| [0013](0013-prelint-i-straz-adr-w-procesie-pr.md) | Prelint jako pamięć decyzji i straż ADR-ów w procesie PR | Proponowany | Proces, `.mcp.json`, szablon PR, krok 6.0 |
| [0014](0014-person-4-baseline-appeals-audit-insights.md) | Kontrakty Osoby 4: standard zespołu, onboarding, odwołania, audyt, dane widoków | Proponowany | `baseline_service`, `appeal_service`, `audit_service`, `insights`, kroki 4.1–4.6 |
| [0015](0015-frontend-navigation-and-data-layer.md) | Frontend SPA: nawigacja, warstwa danych i praca na generowanym kontrakcie | Proponowany | `frontend/src`, kroki 5.x |

## Statusy

- **Proponowany** — zaproponowany, czeka na akceptację zespołu.
- **Accepted** — obowiązuje; zmiany kodu muszą być z nim zgodne.
- **Superseded** — zastąpiony przez nowszy ADR (z odnośnikiem).
- **Deprecated** — wycofany, nie stosuje się do nowych zmian.
