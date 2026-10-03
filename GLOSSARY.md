# GLOSSARY — Słownik pojęć domenowych i technicznych

### 1. Pojęcia domenowe (Zero Standing Privileges & Access Governance)

- **Dzierżawa dostępu (Access Lease)**: Czasowo ograniczone prawo użytkownika do danego repozytorium na określonym poziomie uprawnień. Data ważności dzierżawy przesuwa się w przód wyłącznie w wyniku zarejestrowanej aktywności lub zatwierdzenia przez administratora. *Uwaga terminologiczna: Nie używać terminu „refresh token”.*
- **Okres dzierżawy (Lease Duration)**: Czas trwania dzierżawy liczony od momentu ostatniej kwalifikowanej aktywności (domyślnie: 30 dni; presety: 7, 30, 90 dni lub data niestandardowa).
- **Okno ostrzegawcze (Warning Window)**: Okres przed wygaśnięciem dzierżawy (domyślnie 7 dni), w którym system generuje ostrzeżenia w panelu i umożliwia złożenie odwołania.
- **Zasada Zero Standing Privileges (ZSP)**: Podejście architektoniczne zakładające brak stałych, bezterminowych uprawnień administracyjnych lub modyfikujących. Wszystkie uprawnienia wygasają bez aktywnego użycia.
- **Standard zespołu (Team Baseline / Team Standard)**: Zbiór uprawnień do repozytoriów, w których aktywnych jest minimum 50% członków danego zespołu. Standard proponuje najniższy wystarczający poziom uprawnień. Poziom `admin` nigdy nie wchodzi w skład standardu zespołu automatycznie.
- **Odwołanie (Appeal / Justification)**: Wniosek użytkownika o przedłużenie wygasającego lub wygasłego dostępu, zawierający unikalne uzasadnienie biznesowe. Każde odwołanie wymaga nowego uzasadnienia (brak automatycznego odnawiania na bazie wcześniejszych wniosków — celowe tarcie procesowe / intentional friction).
- **Deeskalacja uprawnień (Permission Down-scoping)**: Obniżenie poziomu dostępu do poziomu rzeczywiście wykorzystywanego (np. degradacja z `admin` do `push`/`write`, gdy użytkownik jedynie pushuje kod).
- **Zabezpieczenie ostatniego administratora (Last Admin Protection / Break-glass Guard)**: Twarda reguła uniemożliwiająca automatyczne lub ręczne odebranie uprawnień ostatniemu administratorowi w organizacji lub pojedynczym repozytorium.
- **Sterowanie czasem (Time Travel / Simulated Clock)**: Mechanizm mocka pozwalający na deterministyczne przesuwanie czasu systemowego w celach testowych i demonstracyjnych (np. przesunięcie zegara o +25 dni i +35 dni).

### 2. Hierarchia uprawnień GitHub i matryca odnawiania

Mapowanie API GitHub ↔ UI Panelu:
- `admin` (API: `admin`)
- `maintain` (API: `maintain`)
- `write` (API: `push`)
- `triage` (API: `triage`)
- `read` (API: `pull`)

Hierarchia: `admin` > `maintain` > `push` (`write`) > `triage` > `pull` (`read`).
Aktywność na wyższym poziomie odnawia poziom bieżący oraz wszystkie poziomy niższe. Aktywność na poziomie niższym **nie odnawia** poziomów wyższych.

- **admin (API: admin)**:
  - *Akcje w mocku*: Zmiana ustawień repozytorium, zarządzanie kolaboratorami, webhooks, reguły branch protection.
  - *Odnawia poziomy*: `admin`, `maintain`, `push`, `triage`, `pull`.
- **maintain (API: maintain)**:
  - *Akcje w mocku*: Zarządzanie release'ami, modyfikacja branchy niechronionych.
  - *Odnawia poziomy*: `maintain`, `push`, `triage`, `pull`.
- **write (API: push)**:
  - *Akcje w mocku*: `git push`, merge Pull Requesta.
  - *Odnawia poziomy*: `push`, `triage`, `pull`.
- **triage (API: triage)**:
  - *Akcje w mocku*: Przypisywanie etykiet (labels), zarządzanie issues, kamienie milowe.
  - *Odnawia poziomy*: `triage`, `pull`.
- **read (API: pull)**:
  - *Akcje w mocku*: Komentarz pod PR/Issue, formalny submit review w PR, otwarcie zgłoszenia.
  - *Odnawia poziomy*: `pull`.
  - *Jawne ograniczenie*: Pasywne pobieranie/przeglądanie kodu nie jest rejestrowane jako aktywność ze względu na brak telemetrii HTTP GET w strumieniu zdarzeń GitHuba.

### 3. Tryby egzekwowania reguł (Enforcement Modes)

- **disabled (wyłączone)**: Rejestracja i audyt bez akcji i bez powiadomień.
- **warning (ostrzeżenie — tryb v1 / MVP)**: Generowanie ostrzeżeń w panelu dla admina i użytkownika; decyzję podejmuje administrator.
- **auto (automatyczna deeskalacja)**: Automatyczne odebranie lub obniżenie uprawnień po upływie dzierżawy (z zachowaniem *Last Admin Protection*).

### 4. Podmioty w systemie

- **IT Security Administrator (Admin)**: Zarządza politykami, zatwierdza wnioski i standardy zespołów, podejmuje decyzje o przedłużeniu/odcięciu dostępu.
- **Developer / Member**: Użytkownik należący do zespołu (DEV / QA), posiadający czasowe dzierżawy dostępów.
- **Organizacja (Organization)**: Symulowana organizacja GitHub (1 admin, zespoły DEV i QA, 15–25 użytkowników, 10–15 repozytoriów).
