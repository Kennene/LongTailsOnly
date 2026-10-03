# PRODUKT: TailCut

> **Hasło przewodnie:** *Żaden dostęp nie jest wieczny.* Wszystkie uprawnienia są odnawialnymi dostępami czasowymi, opartymi na dowodach rzeczywistego użycia.

---

### 1. Wizja i problem biznesowy

#### Kontekst i kategoria
- **Kategoria:** HackYeah Defence + nagroda specjalna Prelint.
- **Domena:** Cyberbezpieczeństwo, Identity & Access Management (IAM), Privileged Access Management (PAM), zasada Zero Standing Privileges (ZSP) oraz Least Privilege.

#### Problem
W nowoczesnych organizacjach uprawnienia w systemach kontroli wersji (GitHub) są przyznawane ad-hoc i bezterminowo („na wszelki wypadek”). 
1. **Privilege Creep (pełzanie uprawnień)**: Programiści zmieniają projekty lub role, zachowując uprawnienia `admin` lub `write` do dziesiątek repozytoriów, których już nie dotykają.
2. **Rozszerzona powierzchnia ataku (Attack Surface)**: Przejęcie pojedynczego konta developera z bezterminowym dostępem administracyjnym pozwala na zatrucie łańcucha dostaw (supply chain attack), wstrzyknięcie złośliwego kodu, kradzież sekretów lub wyłączenie branch protection.
3. **Brak rozliczalności**: Administratorzy nie wiedzą, które uprawnienia są rzeczywiście wykorzystywane, a procesy periodycznego audytu są powierzchowne.

#### Rozwiązanie
Panel administratora bezpieczeństwa IT wprowadzający mechanizm **odnawialnych dostępów czasowych (Access Lease)** do GitHuba:
- Dostęp wygasa samoistnie po ustalonym czasie (domyślnie 30 dni, konfigurowalny przez admina); tryb `warning` wymaga decyzji administratora, a tryb `auto` odbiera lub obniża dostęp automatycznie.
- Dostęp odnawia się wyłącznie w wyniku dowiedzionej aktywności na adekwatnym poziomie uprawnień.
- Dostęp na poziomie `write` (push) nie odnawia się przy samym komentowaniu czy review — system wykrywa brak pushów i proponuje deeskalację do `read`.
- Rola `admin` ma charakter stały (break-glass/owner) i jest zabezpieczona regułą *Last Admin Protection*.
- Przed wygaśnięciem generowane jest ostrzeżenie; użytkownik może złożyć odwołanie z unikalnym uzasadnieniem biznesowym (intentional friction), a administrator dysponuje elastycznym wyborem przedłużenia (mnożniki np. 2x, presety, custom).
- **Architektura pluginowa (Porty i Adaptery)**: Rdzeń systemu jest niezależny od dostawcy — w przyszłości pozwala podpiąć GitLab, Bitbucket lub chmurowe IAM.

---

### 2. Persony i role użytkowników

1. **Tomasz — IT Security Administrator (Admin IT)**
   - *Cel:* Zminimalizować liczbę nieużywanych kont z uprawnieniami `admin`/`write`, zatwierdzać wnioski i standardy zespołów, mieć pełen audyt i wgląd w graf uprawnień.
   - *Bóle:* Strach przed odebraniem komuś dostępu, który nagle zablokuje deployment w nocy; brak przejrzystych danych o realnym użyciu.
2. **Kamil — Senior Developer (Zespół DEV)**
   - *Cel:* Pracować bez tarć w swoich aktywnych projektach; szybko odzyskać dostęp, jeśli faktycznie jest potrzebny.
   - *Zachowanie:* Korzysta z `write` codziennie w 2 repozytoriach, a w 8 innych ma zapomnianego `admina`.
3. **Marta — QA Engineer (Zespół QA)**
   - *Cel:* Dostęp do zgłoszeń (`triage`), tworzenie komentarzy i przegląd wydań testowych; nie potrzebuje dostępu `push` do kodu produkcyjnego.

---

### 3. Kluczowe przypadki użycia (Use Cases)

#### UC-1: Wdrożenie nowego pracownika (Team Baseline Onboarding)
- Nowy developer dołącza do zespołu DEV.
- System automatycznie oblicza **standard zespołu** (repozytoria, w których w ciągu ostatnich 30 dni aktywnie pracowało co najmniej 50% zespołu, na najniższym wystarczającym poziomie, np. `write`). Poziom `admin` nigdy nie jest proponowany automatycznie.
- Administrator zatwierdza nadanie standardu zespołu jednym kliknięciem.

#### UC-2: Wykrywanie i deeskalacja nadmiarowych uprawnień (Down-scoping `write` -> `read`)
- Użytkownik posiada uprawnienie `write` w repozytorium `payment-service`.
- W ciągu ostatnich 30 dni użytkownik nie wykonywał żadnych operacji `git push` (`PushEvent`), ale aktywnie recenzował Pull Requesty (`PullRequestReviewEvent`) i dodawał komentarze (`IssueCommentEvent`).
- System oznacza uprawnienie `write` jako wygasające, proponując obniżenie uprawnień do `read` (użytkownik zachowuje możliwość dyskusji i review, tracąc prawo zapisu do kodu).

#### UC-3: Cykl ostrzeżenia, odwołania i elastycznej decyzji administratora (Warning & Appeal Flow)
- Na 7 dni przed wygaśnięciem dostępu generowane jest ostrzeżenie w panelu.
- Użytkownik składa odwołanie z uzasadnieniem (np. „W przyszłym tygodniu prowadzę release wersji v2.1”).
- Administrator w panelu widzi: historię odwołań użytkownika, statystyki realnego użycia (`ActivityEvent`) oraz treść wniosku.
- Administrator podejmuje decyzję:
  - **Przedłuż (elastyczny wybór)**: mnożnik (np. `1.5x`, `2x` dotychczasowego TTL), preset (`+7`, `+14`, `+30`, `+90` dni) lub dokładna data w kalendarzu.
  - **Wyłącz / Zdeeskaluj**: odbiera dostęp lub degraduje rolę do `read`.

#### UC-4: Sterowanie czasem (Time Travel Demo Mode)
- Specjalny panel demonstracyjny dla jury i audytu umożliwia przesunięcie zegara symulacji (np. +15 dni, +30 dni, +60 dni).
- Pozwala na żywo zaobserwować:
  1. Przejście z zielonego stanu „Aktywny”,
  2. Pojawienie się ostrzeżenia w oknie 7-dniowym,
  3. Stan wygasły i aktywację mechanizmów obronnych.

#### UC-5: Ochrona Ostatniego Administratora (Break-glass / Last Admin Guard)
- Reguła krytyczna: Ani system w trybie automatycznym, ani żaden administrator nie może odebrać uprawnienia `admin`, jeśli w danym repozytorium lub organizacji pozostałby zero administratorów.

---

### 4. Zakres MVP (Hackathon Matrix)

| Moduł | Zakres MVP | Priorytet | Status |
| :--- | :--- | :--- | :--- |
| **M1: Inwentarz uprawnień** | Tabela osób, repozytoriów, poziomów ról, dat ostatniego użycia i statusu dostępu | P0 (Must Have) | MVP |
| **M2: Detekcja nadmiarowości** | Analiza aktywności vs poziom roli (`admin` nieużywany od $N$ dni) | P0 (Must Have) | MVP |
| **M3: Rekomendacje i powiadomienia** | Karta alertów dla admina (Zatwierdź / Odrzuć / Przedłuż) | P0 (Must Have) | MVP |
| **M4: Egzekwowanie polityk** | Tryb `warning` (domyślny v1) oraz opcja `auto` (automatyczne odbieranie) | P0 (Must Have) | MVP |
| **M5: Graf relacji uprawnień** | Wizualizacja relacji Użytkownik ↔ Zespół ↔ Rola ↔ Repozytorium (@xyflow/react) | P0 (Must Have) | MVP |
| **M6: Dziennik audytowy (Historia)** | Niezmienna historia operacji: kto, co, kiedy, z jakim uzasadnieniem, decyzja człowieka vs automatu | P0 (Must Have) | MVP |
| **M7: Symulator GitHuba & Zegar** | Mock REST API GitHuba wg oficjalnej dokumentacji (1 org, zespoły DEV/QA, 15–25 kont, 10–15 repo) + Time Travel Controller | P0 (Must Have) | MVP |
| **M8: Wyjaśnienia LLM** | Generowanie syntetycznego podsumowania ryzyka dla managera w języku naturalnym | P1 (Nice to Have) | Post-MVP |

---

### 5. Granice i ograniczenia systemu

1. **Jeden dostawca w MVP**: Symulowany GitHub Enterprise / Cloud.
2. **Pasywne czytanie**: Brak detekcji klonowania/przeglądania kodu przez HTTP GET (jawne ograniczenie telemetryczne GitHuba).
3. **Brak automatycznych renewali z historii**: Każde przedłużenie na wniosek użytkownika wymaga unikalnego uzasadnienia; system celowo nie akceptuje szablonowych odnowień bez decyzji człowieka.
