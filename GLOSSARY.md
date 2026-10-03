# GLOSSARY — Słownik pojęć domenowych i technicznych

### 1. Pojęcia domenowe (Zero Standing Privileges & Access Governance)

- **Dzierżawa dostępu (Access Lease)**: Czasowo ograniczone prawo użytkownika do danego repozytorium na określonym poziomie uprawnień. Data ważności dzierżawy przesuwa się w przód wyłącznie w wyniku zarejestrowanej aktywności lub zatwierdzenia przez administratora.
- **Okres dzierżawy (Lease Duration / TTL)**: Czas trwania dzierżawy konfigurowany przez administratora (domyślnie: 30 dni). Podczas odnowienia/przeglądu administrator może wydłużyć dzierżawę za pomocą mnożnika (np. 1.5x, 2x dotychczasowego TTL), presetów (+7, +14, +30, +90 dni) lub wartości niestandardowej (liczba dni / data z kalendarza).
- **Okno ostrzegawcze (Warning Window)**: Okres przed wygaśnięciem dzierżawy (domyślnie 7 dni), w którym system generuje ostrzeżenia w panelu i umożliwia złożenie odwołania.
- **Zasada Zero Standing Privileges (ZSP)**: Podejście architektoniczne zakładające brak stałych, bezterminowych uprawnień deweloperskich. Wszystkie uprawnienia wygasają bez aktywnego użycia.
- **Standard zespołu (Team Baseline / Team Standard)**: Zbiór uprawnień do repozytoriów, w których aktywnych jest minimum 50% członków danego zespołu na podstawie telemetrycznego logu zdarzeń (`ActivityEvent`). Standard proponuje najniższy wystarczający poziom uprawnień (`write` lub `read`). Poziom `admin` nigdy nie wchodzi w skład standardu zespołu automatycznie.
- **Odwołanie (Appeal / Justification)**: Wniosek użytkownika o przedłużenie wygasającego lub wygasłego dostępu, zawierający unikalne uzasadnienie biznesowe. Każde odwołanie wymaga nowego uzasadnienia (brak automatycznego odnawiania na bazie wcześniejszych wniosków — celowe tarcie procesowe / intentional friction).
- **Deeskalacja uprawnień (Permission Down-scoping)**: Obniżenie poziomu dostępu do poziomu rzeczywiście wykorzystywanego (w MVP: degradacja z `write` do `read`, gdy użytkownik nie pushuje kodu, ale komentuje lub recenzuje PR-y).
- **Zabezpieczenie ostatniego administratora (Last Admin Protection / Break-glass Guard)**: Twarda reguła uniemożliwiająca odebranie uprawnień ostatniemu administratorowi w organizacji lub pojedynczym repozytorium. Rola `admin` jest stałą rolą zarządczą wyłączoną z automatycznego wygasania dzierżawy.
- **Sterowanie czasem (Time Travel / Simulated Clock)**: Mechanizm mocka pozwalający na deterministyczne przesuwanie czasu systemowego w celach testowych i demonstracyjnych (np. przesunięcie zegara o +7, +25 dni i +35 dni).
- **Architektura Portów i Adapterów (Plugin Architecture)**: Wzorzec architektoniczny oddzielający silnik reguł dzierżaw od konkretnego systemu VCS/IAM za pomocą portów (interfejsów). Umożliwia łatwą wymianę lub dodanie kolejnych providerów (GitHub, GitLab, Bitbucket, chmurowe IAM).

### 2. Hierarchia uprawnień GitHub i matryca odnawiania (MVP)

W fazie MVP dzierżawie podlegają dwa kluczowe poziomy operacyjne:
- `write` (API: `push` / `contents:write`)
- `read` (API: `pull` / `contents:read`)

Rola `admin` pozostaje stałym uprawnieniem zarządczym/właścicielskim (Break-Glass), wyłączonym z cyklu wygasania dzierżaw i chronionym regułą *Last Admin Protection*.

Hierarchia dzierżawiona: `write` > `read`.
Aktywność na poziomie `write` odnawia poziom `write` oraz poziom `read`. Aktywność na poziomie `read` **nie odnawia** poziomu `write`.

- **write (API: push)**:
  - *Monitorowane zdarzenia w GitHub Events API*: `PushEvent` (wypchnięcie commitów lub tagów).
  - *Odnawia poziomy*: `write`, `read`.
- **read (API: pull)**:
  - *Monitorowane zdarzenia w GitHub Events API*: `PullRequestReviewEvent` (formalny submit review w PR), `IssueCommentEvent` (komentarz w dyskusji PR/Issue).
  - *Odnawia poziomy*: `read`.
  - *Jawne ograniczenie telemetryczne*: Pasywne pobieranie/przeglądanie kodu (`git clone`, `git fetch`, przeglądanie www) nie jest rejestrowane jako aktywność ze względu na brak telemetrii HTTP GET w publicznym strumieniu `/events` GitHuba.
- **Ścieżka rozszerzenia post-MVP**:
  - `triage` (`IssuesEvent`: labele, przypisania), `release` (`ReleaseEvent`) oraz Fine-Grained Personal Access Tokens (PAT v2).

### 3. Tryby egzekwowania reguł (Enforcement Modes)

- **disabled (wyłączone)**: Rejestracja i audyt bez akcji i bez powiadomień.
- **warning (ostrzeżenie — tryb v1 / MVP)**: Generowanie ostrzeżeń w panelu dla admina i użytkownika; decyzję podejmuje administrator.
- **auto (automatyczna deeskalacja)**: Automatyczne odebranie lub obniżenie uprawnień po upływie dzierżawy (z zachowaniem *Last Admin Protection*).

### 4. Podmioty w systemie

- **IT Security Administrator (Admin)**: Zarządza politykami, zatwierdza wnioski i standardy zespołów, podejmuje decyzje o przedłużeniu/odcięciu dostępu.
- **Developer / Member**: Użytkownik należący do zespołu (DEV / QA), posiadający czasowe dzierżawy dostępów.
- **Organizacja (Organization)**: Symulowana organizacja GitHub (1 admin, zespoły DEV i QA, 15–25 użytkowników, 10–15 repozytoriów).
