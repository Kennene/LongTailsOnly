# DESIGN.md — język projektowy konsoli GitHub Access Lease Governor

**Tryb powierzchni:** Operate — konsola administratora bezpieczeństwa: dashboard, gęste tabele, modal decyzji, formularze, stany puste/błędu.
**Motyw:** ciemny jest domyślny (`<html class="dark">`, ADR 0001); jasny to świadomy fallback. Wszystkie kolory żyją w `src/index.css`.
**Zasada nadrzędna:** konsola operacyjna cyberobrony — spokojna, wysokosygnałowa, o niskim szumie. Kolor niesie znaczenie, nigdy dekorację.

---

## 1. Kolory stanu — jedno źródło prawdy

| Rodzina tokenów    | Znaczenie                                                                     | Domyślnie (dark)   | Fallback (light)   |
| ------------------ | ----------------------------------------------------------------------------- | ------------------ | ------------------ |
| `status-active`    | dostęp `ACTIVE` — „Aktywny”; odwołanie `APPROVED`                             | `#5dda99`          | `#007044`          |
| `status-warning`   | dostęp `WARNING` — „Wygasa wkrótce”; odwołanie `PENDING`                      | `#f1ba4b`          | `#8a5600`          |
| `status-expired`   | dostęp `EXPIRED` — „Wygasł”; odwołanie `REJECTED`; akcja `REVOKE` („Odbierz”) | `#ff7d7d`          | `#b71824`          |
| `status-downscope` | rekomendacja `DOWNSCOPE` — „Zdeeskaluj”: decyzja doradcza, nie awaria         | `#a9a6f7`          | `#584cad`          |
| `status-revoke`    | alias rodziny krytycznej dla akcji `REVOKE`                                   | `= status-expired` | `= status-expired` |
| `muted`            | rekomendacja `KEEP` — „Bez zmian”: brak koloru jest sygnałem                  | `#23262b`          | `#f2f3f6`          |

Każda rodzina ma cztery zmienne (`--status-<nazwa>`, `-foreground`, `-subtle`, `-border`) wystawione w `@theme inline` jako `--color-status-*`. To **jedyny** sposób wyrażania koloru stanu:

| Utility                                 | Rola                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `text-status-<nazwa>`                   | znak sygnału: kropka, ikona, krawędź grafu, obramowanie toastu                                                                          |
| `text-status-<nazwa>-foreground`        | tekst etykiety na tle `-subtle` (badge, karta KPI, wiersz)                                                                              |
| `bg-status-<nazwa>-subtle`              | tło badge'a / karty KPI / wyróżnionego wiersza (tint: 14% dark, 11% light)                                                              |
| `border-status-<nazwa>-border`          | obramowanie badge'a / karty KPI                                                                                                         |
| `bg-status-<nazwa>` + `text-background` | wypełnienie pełne (węzeł grafu, duża plakietka); tekst na nim to zawsze `text-background`, bo sygnał jest jasny w dark i ciemny w light |

**Odstępstwo nazewnicze:** `-foreground` znaczy „tekst czytelny na `-subtle`”, a nie „tekst na pełnym wypełnieniu” jak w konwencji shadcn `--primary-foreground`. Wynika z kontraktu nazw uzgodnionego z zespołem; pełne wypełnienie tekstuje się przez `text-background`.

**Poziom dostępu** (`read` / `write` / `admin`) ma osobne rodziny `role-read`, `role-write`, `role-admin` (po trzy zmienne: `--role-<poziom>`, `-subtle`, `-border`; bez `-foreground`). Poziom to cecha dostępu, nie jego stan, więc barwy omijają hue stanów i `--primary`: odczyt niebieski (h 245), zapis różowy (h 345), admin pomarańczowy (h 50). Klasy składa wyłącznie `getRoleBadge` w `lib/statusBadges.ts`. Kontrast etykiety `text-role-*` na własnym `-subtle` (liczony z tokenów): dark **7,65 / 7,27 / 7,40**, light **4,84 / 5,26 / 5,14** (read / write / admin).

Statusy odwołań nie mają własnych tokenów — `lib/statusBadges.ts` mapuje `PENDING → warning`, `APPROVED → active`, `REJECTED → expired` i zwraca gotowe klasy tych rodzin.

**Mechanizm — dokładnie jeden.** Etykietę i klasy stanu produkuje `lib/statusBadges.ts` (`getStatusBadge`, `getAppealStatusBadge`), a komponent wyłącznie je składa:

```tsx
<Badge variant="outline" className={getStatusBadge(lease.status).className}>
  {getStatusBadge(lease.status).label}
</Badge>
```

`variant="outline"` daje kształt pigułki, a `className` nadpisuje jego kolory (`cn` scala klasy i wygrywa ostatni konflikt), więc kolor zawsze pochodzi z mapy tokenów — nigdy z wariantu `Badge`a. W tabeli i w modalu decyzji wystarczy gotowy `LeaseStatusBadge`.

**Zakazy:** żadnych klas paletowych (`text-amber-500`, `bg-green-600`), hexów ani `oklch()` w komponentach; **żadnego drugiego mapowania status → kolor** — warianty `status-*` w `components/ui/badge.tsx` są duplikatem mapy i są usuwane (§4); żaden plik poza `lib/statusBadges.ts` nie nazywa klas `status-*`; kolor nigdy nie jest jedynym nośnikiem informacji — etykieta po polsku stoi obok.

**Kontrast** (zmierzony na wyrenderowanej stronie w przeglądarce; próg WCAG 2.1 dla tekstu to 4,5:1):

- dark — etykieta `text-status-*` na własnym `-subtle`: **8,49 / 8,48 / 6,40 / 7,00**; `-foreground`: **10,50 / 10,75 / 8,48 / 9,30** (active / warning / expired / downscope)
- light — odpowiednio **4,96 / 5,05 / 5,25 / 5,57** oraz **7,16 / 7,10 / 6,98 / 7,49**
- neutralne — `--muted-foreground` na `--card` **7,09** (dark) i **6,00** (light); `--primary` na `--background` **10,79** / **5,51**; `--foreground` na `--background` **17,41** / **17,69**

Neutralne warstwy budują głębię: sidebar `#080a0e` < background `#0c0e12` < card `#15171b` < popover `#1b1e23` (dark). Akcent `--primary` (`#4dd4d7` dark, `#007274` light) jest zarezerwowany dla akcji głównej, zaznaczenia i fokusu — nigdy dla stanu dostępu.

## 2. Typografia

Jedna rodzina tekstowa: **Geist Variable** (`--font-sans`, `--font-heading`). Skala stała w `rem`, bez `clamp`:

| Rola                                   | Klasy (dokładny string)                               |
| -------------------------------------- | ----------------------------------------------------- |
| Nagłówek strony (`h1`)                 | `text-2xl font-semibold tracking-tight`               |
| Tytuł karty / sekcji                   | `text-base font-medium` (`CardTitle`, `font-heading`) |
| Treść, komórki tabeli, formularze      | `text-sm` (domyślne `body`)                           |
| Etykiety, badge'y, podpisy, opisy kart | `text-xs`                                             |
| Liczba KPI                             | `font-mono text-2xl`                                  |
| Chrome: nazwa produktu w TopBarze      | `text-sm font-medium` (`min-h-14`)                    |
| Chrome: podtytuł w TopBarze, nawigacja | `text-xs text-muted-foreground`                       |

**Hierarchia stron:** `h1` jest jedynym elementem `text-2xl` w **fonte sans** na ekranie i jedynym mocnym akcentem typograficznym — przy gęstej treści `text-sm` daje czytelny skok rangi w stosunku do tytułów kart (`text-base`). Liczby KPI są jedynymi elementami `text-2xl` w **fonte mono** (tabela wyżej), więc obie 24-pikselowe role są rozłączne: nagłówek mówi „gdzie jesteś”, licznik mówi „ile”. Chrome (TopBar, Sidebar) nigdy nie przekracza `text-sm`: pasek ma zostać cichy, żeby tytuł strony i dane były jedynym, co przyciąga wzrok. Sekcje wewnątrz widoku nie powtarzają rozmiaru `h1` — schodzą do `text-base font-medium`.

**Dolna granica skali:** `text-xs` (12 px) to najmniejszy rozmiar **treści** — tabel, formularzy, komunikatów i etykiet stanu. Poniżej wolno zejść wyłącznie w chrome, które nie niesie informacji krytycznej: pasek czasu symulowanego (`text-[0.7rem]` ≈ 11,2 px) i legenda grafu (`text-[0.65rem]` ≈ 10,4 px). Arbitralne `text-[…]` poza tymi dwoma miejscami są błędem — gdy brakuje rozmiaru, dodajemy token, a nie wartość w locie.

**Mono (`--font-mono`) tylko dla danych, nigdy dla dekoracji:** loginy (`kamil-dev`), nazwy repozytoriów (`payment-gw`), identyfikatory i numery dostępów, daty i godziny, liczby w kartach KPI. Nie używamy mono w nagłówkach, przyciskach ani etykietach stanu — wyjątkiem są identyfikatory wewnątrz zdania.

Liczby w tabelach są tabularne globalnie (`table { font-variant-numeric: tabular-nums }`), więc kolumny „Pozostało dni” i daty nie falują. Tekst prozatorski (uzasadnienie odwołania) trzymamy w 65–75 znakach na linię; tabele mogą być gęste.

## 3. Przestrzeń i promienie

- Rytm: skala Tailwinda co `4px`; wewnątrz grupy `gap-1`/`gap-2`, między grupami `gap-4`, między sekcjami `gap-8`. Nad nagłówkiem zawsze więcej powietrza niż pod nim.
- Gęstość jest cechą tego produktu: wysokość wiersza tabeli ≈ `36–40px`, komórka `p-2`, przyciski `h-8` (`sm: h-7`, `xs: h-6`). Nie rozdymujemy interfejsu dla oddechu — administrator skanuje dziesiątki wierszy.
- **Jak utrzymać 36–40 px (mechanizm, nie życzenie).** Sam limit wysokości nic nie znaczy, dopóki nie wiadomo, co zrobić z długą treścią — dlatego: (1) komórki tożsamości i repozytorium są jednowierszowe (`whitespace-nowrap`); (2) szerokość **rezerwujemy**, nie tylko ograniczamy — `w-* max-w-*` (sam `max-w-*` w `table-layout: auto` nic nie rezerwuje, a samo `w-*` bywa rozciągane przez treść; trzymają dopiero razem); (3) długa proza (uzasadnienie w dzienniku audytu) dostaje `line-clamp-2` + pełny tekst w `title`, zamiast zawijać się w nieskończoność; (4) gdy kolumn jest więcej, niż mieści kontener, **zwijamy shell** (rail ikon poniżej `xl`) i chowamy kolumny drugorzędne (`hidden 2xl:table-cell`) — nie ucinamy danych — a kolumna z decyzją zostaje `sticky right-0`, żeby akcja była osiągalna przy każdym przewinięciu.
- `--radius: 0.5rem` (konsola jest ostrzejsza niż domyślne shadcn): `rounded-lg` dla przycisków i pól, `rounded-xl` dla kart, `rounded-4xl` dla badge'y (pigułka), `rounded-md` dla wewnętrznych kafelków.
- Obramowania: `--border` (12% bieli w dark, `#dbdee2` w light) zamiast cieni; cień tylko dla warstw unoszących się nad treścią (popover, dialog, toast).

## 4. Konwencje komponentów

**Badge statusu** — jedyny nośnik stanu, złożony z mapy w `lib/statusBadges.ts` według wzoru z §1: `<Badge variant="outline" className={getStatusBadge(status).className}>{label}</Badge>` (w praktyce przez `LeaseStatusBadge`, a status odwołania przez `AppealStatusBadge` — obie listy niosą ten sam kształt i ikonę). Kropka sygnału to `<span aria-hidden className="size-1.5 rounded-full bg-current" />` — dziedziczy kolor tekstu, więc nie potrzebuje własnej klasy. Kropka jest obowiązkowa na kartach KPI, opcjonalna w tabeli. Pełne zdanie („Wygasa wkrótce”) zamiast skrótu — w tej domenie czytelność wygrywa z kompaktowością.

**Jedno mapowanie, nie dwa.** Warianty `status-*` w `components/ui/badge.tsx` to druga mapa status → kolor i muszą zniknąć: `badge.tsx` wraca do sześciu wariantów shadcn (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`), a stany wyraża wyłącznie `className` z `statusBadges.ts`. Do czasu usunięcia wariantów **nic ich nie używa**; `grep -rn 'variant="status-' src` musi być pusty.

**Karty KPI** — cztery liczniki dashboardu używają rodzin stanów, nie `--chart-*`: Aktywne (`active`), Ostrzeżenia (`warning`), Wygaśnięte (`expired`), Rekomendacje deeskalacji (`downscope`). Zaimplementowane jako `KpiCard` z `tone: LeaseStatus | 'DOWNSCOPE'`: dla statusów klasy pochodzą z `getStatusBadge(tone).className`, a ton doradczy `DOWNSCOPE` to jedyne miejsce poza `lib/statusBadges.ts`, które nazywa klasy `status-downscope-*` (w `getToneClassName`), bo mapa opisuje statusy dostępów, a nie rekomendacje. Docelowo ta tonacja przenosi się do `statusBadges.ts` jako helper rekomendacji, żeby żaden komponent nie nazywał klas stanu. Tło `bg-status-*-subtle`, obramowanie `border-status-*-border`, liczba `font-mono text-2xl`, etykieta `text-xs text-current`. `--chart-1…5` to rampa kategoryczna dla grafu i wykresów, nie dla stanów.

**Ikona w badge'u.** Status, rekomendacja i poziom niosą ikonę z `lucide-react` **obok** polskiej etykiety (nigdy zamiast niej). Ikona jest częścią mapy, nie komponentu: `BadgeStyle` z `lib/statusBadges.ts` trzyma `icon: LucideIcon` **i** `slug` (nazwę, którą lucide wypisuje w `class` jak `lucide-clock`), więc `LeaseStatusBadge`, `AppealStatusBadge`, `RecommendationBadge` i `RoleBadge` tylko składają. Slug jest w mapie, bo `icon.name` bywa zminifikowane, a `displayName` zależy od builda pakietu — kontrakt z DOM-em musi być stabilny.

Dobór ikon jest znaczący, nie dekoracyjny: `CircleCheck` (aktywna), `Clock` (termin ucieka), `CircleX` (wygasła), `Shield`/`ShieldOff` (para break-glass). Rekomendacje biorą czasowniki: `CheckCircle2` (bez zmian), `ArrowDownCircle` (zdeeskaluj), `Ban` (odbierz — jedyna akcja nieodwracalna). Status mówi, czym dostęp _jest_; rekomendacja, co _zrobić_ — dlatego `Clock` i `ArrowDownCircle` są różne, choć obie dotyczą czasu. Poziom: `Eye` czyta, `Pencil` pisze, `Shield` chroni `admin`.

**Awatar** — `UserAvatar` to krąg `size-6` z **generowaną ilustracją** z `lib/avatarUrl.ts` (DiceBear, seed = login) i inicjałami z `lib/userInitials.ts` jako podkładem. Krąg jest malowany wyłącznie `bg-muted` + `border-border` + `text-muted-foreground` — **taki sam dla wszystkich**, bo w tej konsoli kolor niesie stan dostępu, a nie osobę; osobę rozróżnia sam obraz.

**Dlaczego nie `github.com/<login>.png`.** Loginy demo są fikcyjne, ale `kamil`, `marta` i `ania` **kolidują z prawdziwymi kontami GitHuba** (`kamil-dev` → uid 42606532, `marta` → 29160773). Taki adres wstawiłby do konsoli twarze obcych, realnych osób pod wymyślonymi personami bezpieczeństwa — to nie jest kwestia estetyki. Generowana ilustracja nie przedstawia nikogo i jest deterministyczna dla loginu, więc demo wygląda tak samo po resecie.

**Styl wybrany pomiarem.** W docelowych 24 px czyta się tylko `personas`; `notionists` (domyślny DiceBeara) ma `viewBox` 1744 i figura zajmuje w nim ułamek, więc w kole zostawała ciemna plama, a `micah`, `open-peeps` i `adventurer` gubią szczegół. Porównanie ośmiu stylów obok siebie w 24 px rozstrzygnęło wybór — nie upodobanie.

**Trzy warstwy odporności**, bo to zewnętrzne zapytanie sieciowe na każdy wiersz: inicjały leżą **pod** obrazem (komórka nigdy nie jest pusta), `onError` gasi obraz i zostawia inicjały (brak sieci psuje obraz, nie tabelę), a `onLoad` usuwa inicjały, żeby nie przeświecały przez ilustrację. Awatar stoi **na końcu** komórki tożsamości (nazwa, login, awatar), bo nazwa jest sygnałem, a obraz tylko go potwierdza. Rozmiar jest wymierzony: komórka `p-2` + `leading-5` to bazowe 36 px, `size-7` rozdymał wiersz do 45 px, czyli poza pasmo §3 — `size-6` daje 40 px.

**Chip zespołu** — `TeamChip` to jeden kształt w dwóch rolach: w kolumnie `Zespół` **stwierdza** przynależność (sam `Badge`, nie kontrolka), a nad tabelą **filtruje** (`Badge asChild` + `<button aria-pressed>`). Rozróżnia je zachowanie, nie wygląd. Stan zaznaczenia jedzie w `aria-pressed` i wzmacnia go rodzina `status-active`, więc wybrany filtr nie jest niesiony samym kolorem (§6). Lista chipów powstaje z **danych**, nie z zamkniętej listy — nowy zespół w backendzie pojawia się sam, a `null` dostaje chip „Bez zespołu”. Dlatego filtr nigdy nie opróżnia tabeli: każdy chip pochodzi z wierszy, które filtruje, i nie ma tu osobnego stanu pustego „brak dostępów w tym zespole”.

**Tabela** — nagłówki `text-muted-foreground font-medium`, sortowanie `EXPIRED → WARNING → ACTIVE`, wiersze oddzielone `border-b`, hover `bg-muted/50`. Kolumny: Użytkownik i Repozytorium w `font-mono`; Status, Rekomendacja i Poziom jako badge z ikoną; Zespół jako chip; akcja wiersza to jeden przycisk `outline` „Decyzja”, nie trzy ikony. **Wzór wspólny dla wszystkich tabel** (Dostępy, Audyt, Odwołania, Standard zespołu; `components/common/TableCells.tsx`): pierwsza kolumna — tożsamość wiersza (Użytkownik, Aktor, Repozytorium) — trzyma lewą krawędź, każda kolejna jest wyśrodkowana (`HeadCell`, `CELL_CENTER`). Kolumny, które opisują tylko wpisy pod grupą („Poziom”, „Status”, „Akcje”; w Audycie „Cel” i „Uzasadnienie”), są w `<thead>` `sr-only`, a na ekranie podpisuje je `ColumnCaption` w wierszu grupy po jej rozwinięciu. Poziom wszędzie jest `RoleBadge`, nie gołą etykietą. Status nigdy nie jest sortowany po kolorze — kolejność wynika z `days_remaining`. Grupowanie po zespole jest **filtrem nad tabelą**, a nie drugą osią sortowania: tabela zostaje płaska i posortowana po pilności.

**Modal decyzji** — jedyne miejsce, w którym modal jest uzasadniony (chroniony fokus, sekwencja nieodwracalna). Zawiera kontekst dostępu, statystyki użycia i trzy ścieżki: Przedłuż (`default`), Zdeeskaluj (`outline`), Odbierz (`destructive`, z potwierdzeniem). Akcje destrukcyjne nie są domyślnie sfokusowane. Błąd `403` (Last Admin Protection) pokazujemy w miejscu akcji, stałym tekstem: „Nie można odebrać uprawnień ostatniemu administratorowi.”

**Tarcie procesowe w modalu (reguły silnika).** `Zdeeskaluj` i `Odbierz` niosą **wymagane** uzasadnienie (przycięte; puste → `aria-invalid`, `role="alert"` i żadnego żądania), bo silnik dostępów odrzuca je bez niego kodem `422` (`decision_service._required`) — audyt ma nieść powód, nie tylko fakt (ADR 0005). `Przedłuż` uzasadnienia nie wymaga. Dostęp administratora (`current_role: admin`) **nie pokazuje kontrolek przedłużania**, tylko zdanie „Dostęp administratora nie wygasa — nie można go przedłużyć.”, bo `extend_lease` odrzuca `Role.ADMIN` właśnie takim kodem; strażnik opiera się na **roli**, nie na statusie, więc dostęp bez terminu i bez roli `admin` nadal da się przedłużyć. Odebrany dostęp read/write zachowuje kontrolki, bo przedłużenie **przywraca** go przez port dostawcy (`is_active = True`, podstawa = teraz).

**Stany** — każdy widok obsługuje trzy stany w tej samej formie, zaimplementowane i potwierdzone w kodzie:

- **ładowanie** — `Skeleton` w układzie docelowym, nigdy spinner w środku treści: wrapper `<div role="status" className="flex flex-col gap-2">`, w nim `<span className="sr-only">Wczytywanie …</span>` i wiersze `Skeleton aria-hidden` o wysokościach docelowego układu (`h-10` nagłówek, `h-9` wiersz).
- **błąd** — `Alert variant="destructive"` z `AlertTitle` („Nie udało się pobrać dostępów”), `AlertDescription` („Serwer nie odpowiedział. Spróbuj ponownie.”) i `AlertAction` z `<Button variant="outline" size="sm">Odśwież</Button>`; akcja ponawia dokładnie to samo zapytanie.
- **pustka** — jedno zdanie `text-sm text-muted-foreground`, które uczy interfejs: „Brak dostępów do wyświetlenia” w tabeli, „Brak dostępów w oknie ostrzegawczym — użyj podróży w czasie, aby je wywołać.” w odwołaniach. Nigdy gołe „Brak danych”.

**Picker usługi (chrome)** — `ServicePicker` w pasku górnym to kontrolka **chrome**, więc obowiązuje ją limit rozmiaru z §2, a nie skala treści: `h-8` (rdzeń `SELECT_CLASSES`) i `text-xs`; żadnego `text-sm` ani własnej wysokości. Jest **czwartym natywnym `<select>`** w panelu obok `AppealForm`, `GraphFilters` i `AuditFilters` — dzieli z nimi `lib/selectClasses.ts`, różni się wyłącznie paddingiem (`pr-7` na natywną strzałkę) i rozmiarem tekstu, i **nie ukrywa strzałki** (`appearance-none`), bo przy `h-8` to ona daje afordancję bez nowej zależności. Radixowy `Select` jest tu odrzucony po raz czwarty: nie przyjmuje `userEvent.selectOptions` i wymaga polyfilli w jsdom.

- **`--primary` jest zarezerwowany dla zaznaczenia i fokusu** (§1) — aktywną usługę niesie nazwa i ikona w kontrolce, nie kolor; tło pochodzi ze wspólnego rdzenia (`bg-transparent` / `dark:bg-input/30`) i nie jest nadpisywane w miejscu użycia. Kontrolka **nie jest drugim przyciskiem `variant="default"`**: nie ma własnego wypełnienia, obramowania stanu ani plakietki aktywności.
- **Ikona usługi** stoi obok kontrolki (`size-4`, `text-muted-foreground`, `aria-hidden`) i podlega regułom ikon z §6 — wyłącznie `lucide-react` plus dwa własne znaki firmowe (`Github`, `Gitlab` nie istnieją w lucide 1.51); dla usługi spoza rejestru frontendu wchodzi generyczny glif (`Blocks`). Nazwę zawsze niesie sąsiedni tekst: etykieta pola jest `sr-only` („Usługa”), a opcje pokazują `name` z katalogu, z dopiskiem `(niedostępna)` przy `is_available === false` i `(nieznana)` dla zapisu spoza katalogu.
- **Błąd katalogu nie zabiera kontrolki.** Gdy `GET /api/v1/services` padnie, `Alert variant="destructive"` stoi **obok** selecta, nigdy zamiast niego — użytkownik z nieaktualnym zapisem musi móc się przełączyć, mimo że backend leży. Alert jest jednowierszowy (`w-auto py-1 text-xs`), więc pasek `min-h-14` nie rośnie dla komunikatu; rejestr frontendu zna w tym stanie kilka usług, więc kontrolka nadal ma czym się wypełnić.
- **Stanu ładowania nie ma jako spinnera** (§4, „Stany”): zanim katalog dotrze, opcje pochodzą z rejestru frontendu, a `aria-busy` jest ustawiane w trakcie. Zakaz „spinnera w środku treści” dotyczy tu całej kontrolki.

**Formularze** — `Label` nad polem, `Input`/`Textarea` z widocznym fokusem (`ring-ring/50`), błąd walidacji pod polem (`aria-invalid` + `text-status-expired-foreground`), uzasadnienie odwołania jest wymagane (intentional friction) i ma `min-h-24`.

**Toast** — `sonner` z `richColors`; kolory typów pochodzą z rodzin stanów (`success → active`, `warning → warning`, `error → expired`, `info → neutralne`). Toast potwierdza decyzję, nie zastępuje odświeżenia danych.

**Graf** — pajęczyna w stylu Neo4j Browser (`components/graph/`), nie kolumny. Węzeł to okrąg z etykietą w środku (`font-mono text-xs`, łamana po myślnikach, maks. trzy linie, pełna nazwa w `title`). **Typ** niosą rozmiar (zespół > osoba > repozytorium, `GRAPH_NODE_RADIUS` w `lib/graphForceLayout.ts`) i delikatny tint z rampy `--chart-*` (zespół `chart-4`, osoba `chart-1`, repo `chart-5`) na nieprzezroczystym `bg-card`. **Status** niosą obrys i kropka z `getStatusBadge` (najgorszy status dostępów węzła), nigdy wypełnienie. Krawędź to prosta linia od brzegu do brzegu okręgu z grotem: kolor ze statusu (`currentColor` z klasy `getStatusBadge`), grubość z roli (admin > write > read), członkostwo cienkie i kropkowane w `text-muted-foreground`.

Układ liczy deterministycznie `computeForceLayout` (d3-force, stałe ziarno, 300 ticków, bez ciągłej animacji) raz na pełnym grafie, więc filtry nie przesuwają węzłów; `position` z API jest ignorowane. Kliknięcie węzła (albo wybór osoby w polu „Osoba”) podświetla drogi dostępu z `lib/graphHighlight.ts`: krawędzie grubsze, płynące przerywaną kreską od źródła do celu, z etykietą roli **wzdłuż** linii; reszta wygasa do 15% w 300 ms (`ease-out-quiet`). Hover bez zaznaczenia przygasza resztę do 45%. Zaznaczenie żyje w URL (`?user=`, `?repo=`, `?team=` po etykiecie), Escape i klik w tło je czyszczą, a panel boczny (`Card`) listuje dostępy od najwyższego ryzyka gotowymi odznakami z `components/leases`. Animacja krawędzi niesie stan (zaznaczenie), więc mieści się w §5; `prefers-reduced-motion` gasi ją globalną regułą. Tryb kolorów React Flow idzie za motywem aplikacji (`colorModeOf`), bo `colorMode="dark"` przełącza tokeny na ciemne także w jasnym motywie.

## 5. Ruch

160 ms na wszystkie przejścia stanu (`--default-transition-duration`), wygaszanie `cubic-bezier(0.22, 1, 0.36, 1)` (`ease-out-quiet`). Ruch komunikuje zmianę stanu (hover, fokus, rozwinięcie wiersza, pojawienie się toastu) — nie dekoruje. Zakaz choreografii wejścia strony: konsola ładuje się w zadanie. `@media (prefers-reduced-motion: reduce)` sprowadza animacje i przejścia do 0,01 ms — każdy nowy efekt musi to respektować bez wyjątków.

## 6. Dostępność

- Kontrast tekstu ≥ 4,5:1, elementów interfejsu ≥ 3:1; wartości dla statusów są zmierzone w §1 — przy zmianie tokenu należy je przeliczyć ponownie.
- Fokus zawsze widoczny (`focus-visible:ring-3 ring-ring/50`), nigdy `outline: none` bez zamiennika; kolejność tabulacji zgodna z kolejnością czytania.
- Stan niesie etykieta i kształt, kolor tylko wzmacnia. Kropka sygnału jest `aria-hidden`.
- Ikony wyłącznie z `lucide-react`, jeden zestaw i jedna grubość kreski; żadnych emoji ani glifów Unicode w roli ikony.
- Powierzchnie przeglądarki należą do systemu: `color-scheme` per motyw (natywne scrollbary), `::selection` z `--primary`, `caret-color: var(--primary)`, `scrollbar-color` w tonie `--foreground`.
- `color-scheme` **nie wystarcza** dla listy opcji natywnego `<select>`: przeglądarka maluje ją poza CSS strony, a gdy select ma własne `background`/`color` (nasze mają `bg-transparent`), popup sięga po jasny motyw systemowy i jasny tekst opcji staje się nieczytelny. Dlatego `select option` dostaje w `index.css` jawnie `--popover` i `--popover-foreground`.
- Dialogi: `Dialog` z Radixa (pułapka fokusu, `Esc`, `aria-labelledby`), nie własne nakładki.

## 7. Zasady — krótko

**Rób:** składaj stan przez `getStatusBadge()` / `getAppealStatusBadge()` z `lib/statusBadges.ts`; trzymaj identyfikatory w `font-mono`; pokazuj liczby jako `tabular-nums`; rozróżniaj „wygasa” (warning) od „wygasła” (expired); zostawiaj stan pusty z instrukcją; sprawdzaj kontrast po zmianie palety.

**Nie rób:** nie wpisuj kolorów ani hexów w komponenty; nie twórz drugiego mapowania statusów poza `lib/statusBadges.ts`; nie formatuj dat poza `lib/dateTime.ts`; nie używaj mono do „technicznego wyglądu”; nie stawiaj kart w kartach ani nie zamieniaj tabeli na stos kart; nie dodawaj animacji, która nie niesie stanu; nie używaj koloru jako jedynego sygnału.

## 8. Źródła prawdy

| Co                                             | Gdzie                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Kolory i promienie                             | `src/index.css` (`@theme inline` + `:root` / `.dark`)             |
| Status → etykieta, klasy i ikona (jedyna mapa) | `src/lib/statusBadges.ts` (także odwołania, role i ich `slug`)    |
| Daty i czas symulowany                         | `src/lib/dateTime.ts` (formatowanie, `Europe/Warsaw`, porównania) |
| Inicjały awatara                               | `src/lib/userInitials.ts` (nazwa, potem login)                    |
| Adres obrazu awatara                           | `src/lib/avatarUrl.ts` (DiceBear `personas`, seed = login)        |
| Kształt badge'a (bez koloru stanu)             | `src/components/ui/badge.tsx` (`variant="outline"`)               |
| Ten dokument                                   | opisuje system; zmiana języka projektowego zaczyna się tutaj      |

Uwaga o zależnościach zewnętrznych: awatary to **jedyny** zasób pobierany spoza aplikacji (`api.dicebear.com`, SVG ~3–5 KB na osobę, cache przeglądarki po `seed`); reszta konsoli nie wychodzi poza własne API. Gdy backend dostanie `avatar_url` w kontrakcie, `lib/avatarUrl.ts` jest jedynym miejscem do podmiany.

Uwaga wdrożeniowa: Tailwind **milczy** o nieistniejących utility — literówka w nazwie tokenu nie wywali builda, tylko nie nada koloru. Po dodaniu nowej klasy statusu sprawdź ją w `dist/assets/*.css`. Ta sama pułapka dotyczy ikon: nazwa eksportu z `lucide-react`, która nie istnieje, jest `undefined`, a `<Icon />` wtedy **wywala render**, więc `slug` w `statusBadges.ts` jest jednocześnie asercją, że eksport istnieje.
