# ADR 0004: Emulacja GitHub REST API i reguła Last Admin Protection

## Kontekst
Wymaganiem projektowym jest obsługa jednego systemu (GitHub) w oparciu o mock udający oficjalne REST API GitHuba (te same adresy URL, kody odpowiedzi HTTP i formaty JSON). Należy także zapewnić bezpieczeństwo ciągłości działania repozytoriów.

## Decyzja
1. **Struktura mocka GitHuba**:
   - Router `/api/v3/...` bezpośrednio w FastAPI implementujący oficjalne endpointy:
     - `GET /repos/{owner}/{repo}/collaborators`
     - `PUT /repos/{owner}/{repo}/collaborators/{username}`
     - `DELETE /repos/{owner}/{repo}/collaborators/{username}`
     - `GET /repos/{owner}/{repo}/events`
     - `GET /orgs/{org}/members`
2. **Reguła Last Admin Protection (Break-Glass Guard)**:
   - Ani administrator przez UI, ani mechanizm automatycznego wygasania nie może usunąć ostatniego użytkownika z uprawnieniem `admin` w danym repozytorium lub w całej organizacji.
   - W przypadku próby wykonania takiej akcji mock API zwraca błąd biznesowy `403 Forbidden` (`Cannot remove the last administrator of the repository/organization`).

## Konsekwencje
- Panel IT komunikuje się ze strukturami identycznymi z produkcyjnym GitHub Enterprise.
- Zagwarantowane bezpieczeństwo przed przypadkowym zablokowaniem (lockout) organizacji.
