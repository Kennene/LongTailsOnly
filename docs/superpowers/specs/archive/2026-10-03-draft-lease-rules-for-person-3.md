# ADR 0007: Ewaluacja dzierżawy, decyzje administratora i tryby egzekwowania

## Status

Proponowany (2026-10-03). Doprecyzowuje ADR 0002, ADR 0003 i ADR 0005 do poziomu implementacji. Zastępuje opis Zadania 8 z planu głównego (który zakładał odnawianie roli `admin`).

## Kontekst

ADR 0002 ustala hierarchię `write > read` ze stałą rolą `admin`, a ADR 0005 — wachlarz decyzji (mnożnik, presety, custom). Brakuje jednak jednoznacznych reguł dla: statusu dzierżawy, rekomendacji, odnawiania przez zdarzenia, wyliczania nowej daty przy przedłużeniu, odwołań i trybu `auto` (M4 w `PRODUKT.md`). Bez tego backend (Zadania 8, 10, 11) i frontend (Zadania 13–15) mogą zinterpretować to samo zachowanie na różne sposoby.

## Decyzja

### 1. Status dzierżawy (`evaluate_status`)

Kolejność reguł (pierwsza pasująca wygrywa), gdzie `now = clock.get_current_time()`:

1. `revoked_at is not None` → `REVOKED`
2. `current_role == admin` → `PERMANENT` (brak wygasania, `days_remaining = None`)
3. `expires_at - now <= 0` → `EXPIRED`
4. `expires_at - now <= 7 dni` → `WARNING`
5. w przeciwnym razie → `ACTIVE`

`days_remaining = ceil((expires_at - now) / 1 dzień)` — wartość może być ujemna dla wygasłych. Dla `PERMANENT` i `REVOKED` wynosi `None`.

### 2. Rekomendacja (`recommend`)

Okno: `[now - lease_days, now]`, gdzie `lease_days = repo.default_lease_days` (domyślnie 30). Brane są tylko zdarzenia tego użytkownika w tym repozytorium.

| Rola | Zdarzenie `write` w oknie | Tylko zdarzenia `read` w oknie | Brak zdarzeń |
| --- | --- | --- | --- |
| `admin` | `KEEP` | `KEEP` | `KEEP` |
| `write` | `KEEP` | `DOWNSCOPE` | `REVOKE` |
| `read` | `KEEP` | `KEEP` | `REVOKE` |

Rekomendacja jest liczona dla każdej dzierżawy (także `ACTIVE`). UI eksponuje ją jako akcję tylko wtedy, gdy jest inna niż `KEEP`. Dla `REVOKED` rekomendacja to zawsze `KEEP` (nie ma już czego odbierać).

### 3. Odnawianie przez zdarzenia (`record_activity`)

Każde zdarzenie jest zapisywane w `ActivityEvent` i nigdy nie jest nadpisywane. Dzierżawa (o ile istnieje, nie jest odebrana i nie jest `admin`) odnawia się wtedy, gdy `rank(required_permission) >= rank(current_role)`:

```
expires_at = max(expires_at, occurred_at + lease_days)
```

Zdarzenia `read` nie przesuwają dzierżawy `write`. `max` zapewnia, że zdarzenie nie skróci dzierżawy przedłużonej wcześniej przez administratora.

### 4. Decyzje administratora (`apply_decision`)

Wspólne dla decyzji o dzierżawie i o odwołaniu. Wszystkie czasy pochodzą z `ClockPort`.

| Akcja | Efekt |
| --- | --- |
| `EXTEND` + `days=N` | `expires_at = max(now, expires_at) + N dni` (presety `+7/+14/+30/+90` to po prostu `days`) |
| `EXTEND` + `multiplier=M` | `ttl = expires_at - granted_at`; `expires_at = now + round(ttl_dni × M) dni` |
| `EXTEND` + `until=D` | `expires_at = D`; `D <= now` → błąd walidacji (422) |
| `DOWNSCOPE` | tylko z `write`: `VCSProvider.set_permission(..., read)`, następnie `current_role = read`, `granted_at = now`, `expires_at = now + lease_days` |
| `REVOKE` | `VCSProvider.remove_collaborator(...)`, następnie `revoked_at = now` |
| `REJECT` | tylko dla odwołań: odwołanie → `REJECTED`, dzierżawa bez zmian |

Każde `EXTEND` ustawia także `granted_at = now`, dzięki czemu kolejny mnożnik liczy się od faktycznie przyznanego okresu (ADR 0005: wielokrotne przedłużenia). `EXTEND` odbiera odwołanej dzierżawie `revoked_at` dopiero po `set_permission` — przywrócenie dostępu idzie przez port.

Dzierżawa `admin` nie podlega `EXTEND` ani `DOWNSCOPE` (422). `REVOKE` na `admin` przechodzi przez port, więc ostatni admin kończy się `LastAdminError` → HTTP 403 i wpisem `LAST_ADMIN_BLOCKED` w audycie.

Każda decyzja zapisuje `AuditLog` (`ADMIN`, login admina z konfiguracji, akcja `LEASE_EXTENDED` / `LEASE_DOWNSCOPED` / `LEASE_REVOKED` / `APPEAL_REJECTED`, cel `owner/repo:login`, `details` z parametrami i uzasadnieniem). Uzasadnienie decyzji administratora jest wymagane.

### 5. Odwołania

- Odwołanie można złożyć dla dzierżawy w statusie `WARNING`, `EXPIRED` albo `REVOKED`; w innym statusie → 409.
- Na jedną dzierżawę może być najwyżej jedno odwołanie `PENDING` (409).
- Uzasadnienie po normalizacji (`strip`, zwinięcie białych znaków, `casefold`) musi być niepuste i różne od **wszystkich** wcześniejszych uzasadnień tego użytkownika (422) — celowe tarcie z ADR 0005.
- `requested_role` = bieżąca rola dzierżawy.
- Decyzja `EXTEND`/`DOWNSCOPE`/`REVOKE` wykonuje §4 na dzierżawie. Status odwołania: `EXTEND` → `APPROVED`; `DOWNSCOPE`/`REVOKE`/`REJECT` → `REJECTED` (zmienione przez ADR 0008 §5.3). Zawsze `resolved_at = now`.
- Złożenie odwołania zapisuje `AuditLog` (`USER`, `APPEAL_SUBMITTED`).

### 6. Tryby egzekwowania

- `warning` (domyślny): system tylko wylicza statusy i rekomendacje, a decyzje podejmuje administrator.
- `auto`: po każdym przesunięciu zegara (oraz po przełączeniu na `auto`) system wykonuje rekomendację dla każdej dzierżawy w statusie `EXPIRED`: `DOWNSCOPE` → §4 `DOWNSCOPE`, `REVOKE` → §4 `REVOKE`, aktor `SYSTEM`. `LastAdminError` nie przerywa przebiegu, tylko zostaje zapisany jako `LAST_ADMIN_BLOCKED`.
- Tryb `disabled` z `GLOSSARY.md` jest poza MVP.
- Tryb jest trzymany w pamięci procesu (jak offset zegara) i resetuje się przy restarcie.

### 7. Standard zespołu (doprecyzowanie ADR 0005)

- Członkowie zespołu: użytkownicy z danym `team` i `is_admin = False`. Okno: `[now - 30 dni, now]`.
- Repozytorium wchodzi do standardu, gdy `2 × aktywni >= członkowie` (dokładnie 50% wystarcza).
- Proponowana rola: `write`, gdy co najmniej połowa aktywnych członków ma w oknie zdarzenie `write`; w przeciwnym razie `read`. `admin` nigdy.
- Zastosowanie standardu dla nowej osoby (`apply`) wywołuje `VCSProvider.set_permission` dla każdego repozytorium bez aktywnej dzierżawy tej osoby i tworzy dzierżawę `granted_at = now`, `expires_at = now + lease_days`. W audycie zapisywany jest `BASELINE_APPLIED`.

## Konsekwencje

- Backend i frontend mają jednoznaczne reguły, a testy graniczne (0 i 7 dni, dokładnie 50%) wynikają wprost z tego ADR.
- Scenariusze demo (seed, Zadanie 4) muszą być spójne z §3: `expires_at` = ostatnie zdarzenie odnawiające + 30 dni.
- Tryb `auto` wpływa na przebieg pitchu. Domyślne `warning` daje administratorowi pełną kontrolę podczas demo.
