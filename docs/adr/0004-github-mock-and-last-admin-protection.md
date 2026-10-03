# ADR 0004: Emulacja GitHub REST API i reguła Last Admin Protection

## Kontekst

Wymaganiem projektowym jest obsługa jednego systemu (GitHub) w oparciu o mock udający oficjalne REST API GitHuba (te same adresy URL, kody odpowiedzi HTTP i formaty JSON). Należy także zapewnić bezpieczeństwo ciągłości działania repozytoriów.

## Decyzja

1. **Zgodność z oficjalną dokumentacją GitHub REST API**:
   - Mock musi być w 100% zgodny ze specyfikacją oficjalnej dokumentacji GitHuba (_GitHub REST API documentation_):
     - Dokładne schematy payloadów JSON (np. struktury `user`, `permissions`, `role_name`, `actor`, `repo`, `payload` w zdarzeniach).
     - Oficjalne kody odpowiedzi HTTP (`200 OK`, `201 Created`, `204 No Content`, `403 Forbidden`, `404 Not Found`, `422 Unprocessable Entity`).
     - Standardowe nagłówki GitHuba (np. `X-GitHub-Media-Type`, `link` do paginacji, nagłówki rate limitu).
     - Rzeczywiste schematy zdarzeń GitHuba dla telemetrycznego strumienia: `PushEvent`, `PullRequestReviewEvent`, `IssueCommentEvent`.
2. **Struktura mocka GitHuba**:
   - Router `/api/v3/...` bezpośrednio w FastAPI implementujący oficjalne endpointy:
     - `GET /repos/{owner}/{repo}/collaborators`
     - `PUT /repos/{owner}/{repo}/collaborators/{username}`
     - `DELETE /repos/{owner}/{repo}/collaborators/{username}`
     - `GET /repos/{owner}/{repo}/events`
     - `GET /orgs/{org}/members`
3. **Reguła Last Admin Protection (Break-Glass Guard)**:
   - Ani administrator przez UI, ani mechanizm automatycznego wygasania nie może usunąć ostatniego użytkownika z uprawnieniem `admin` w danym repozytorium lub w całej organizacji.
   - W przypadku próby wykonania takiej akcji mock API zwraca błąd biznesowy `403 Forbidden` (`Cannot remove the last administrator of the repository/organization`) zgodnie z konwencją błędów GitHuba (`{"message": "...", "documentation_url": "..."}`).

## Konsekwencje

- Panel IT komunikuje się ze strukturami identycznymi z produkcyjnym GitHub Enterprise, co gwarantuje bezproblemową podmianę adaptera mockowego na rzeczywistego klienta GitHub API w przyszłości.
- Zagwarantowane bezpieczeństwo przed przypadkowym zablokowaniem (lockout) organizacji.
