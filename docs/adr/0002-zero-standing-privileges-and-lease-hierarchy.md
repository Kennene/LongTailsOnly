# ADR 0002: Model dostępu czasowego (Access Lease) i hierarchia uprawnień (MVP)

## Kontekst
Głównym problemem bezpieczeństwa jest pełzanie uprawnień (privilege creep) i bezterminowy dostęp do repozytoriów. Każde uprawnienie operacyjne powinno wygasać, jeśli nie jest aktywnie wykorzystywane. Jednocześnie zadania administracyjne wykonuje się rzadko, a pełna 5-stopniowa hierarchia w MVP generowałaby nadmierną złożoność i fałszywe wygaśnięcia kont właścicieli.

## Decyzja
1. **Dostęp zamiast stałych uprawnień (ZSP)**:
   - Przypisania uprawnień deweloperskich mają postać dostępu (`Lease`) z datą wygaśnięcia `expires_at`.
   - Domyślny okres dostępu jest konfigurowany przez administratora (domyślnie: **30 dni**; okno ostrzegawcze: **7 dni**).
2. **Uproszczona hierarchia uprawnień MVP (`write` -> `read`)**:
   - Wygasaniu podlegają wyłącznie dwa poziomy operacyjne:
     - `write` (dostęp z prawem zapisu / push)
     - `read` (dostęp z prawem odczytu / review / issues)
   - **Rola `admin` jako stała (Break-Glass)**: Konta właścicieli organizacji i administratorów IT są wyłączone z automatycznego wygasania dostępu i chronione przez twardą regułę *Last Admin Protection*.
3. **Mapowanie na autentyczne zdarzenia GitHub Events API**:
   - Stan i odnawianie dostępu weryfikowane są na podstawie strumienia zdarzeń (`ActivityEvent` odpowiadającego `/events` GitHuba):
     - **Poziom `write`**: potwierdzany przez `PushEvent` (wypchnięcie commitów lub tagów).
     - **Poziom `read`**: potwierdzany przez `PullRequestReviewEvent` (recenzja PR) oraz `IssueCommentEvent` (komentarz w dyskusji).
   - Aktywność poziomu `write` odnawia zarówno prawo zapisu, jak i odczytu.
   - Aktywność poziomu `read` odnawia wyłącznie prawo do odczytu — **nie odnawia poziomu `write`**.
4. **Deeskalacja (Down-scoping `write` -> `read`)**:
   - Jeśli użytkownik z rolą `write` w ciągu 30 dni nie wykonał `PushEvent`, ale aktywnie recenzował kod (`PullRequestReviewEvent` / `IssueCommentEvent`), system nie odcina go całkowicie, lecz proponuje deeskalację do poziomu `read`.
5. **Ścieżka rozszerzenia post-MVP**:
   - Architektura umożliwia dołączenie kolejnych poziomów i zdarzeń (np. `triage` na bazie `IssuesEvent`, `release` na bazie `ReleaseEvent` oraz Fine-Grained PATs).

## Konsekwencje
- Eliminacja martwych uprawnień zapisu bez ryzyka przypadkowego zablokowania administratorów repozytoriów.
- Prosta, przejrzysta i w 100% deterministyczna logika demonstracji w oparciu o oficjalne typy zdarzeń GitHuba.
