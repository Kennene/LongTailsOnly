/**
 * Szerokości kolumn tożsamości — rezerwacja **i** sufit naraz. W `table-layout: auto` samo
 * `max-w-*` jest wyłącznie sufitem i niczego nie rezerwuje (kolumna zwijała się do ~108 px,
 * a `Ostatnia aktywność` rosła do ~234 px, spychając `Status`, `Rekomendację` i akcję wiersza
 * poza ekran), natomiast samo `w-*` nie trzyma kolumny, gdy treść jest szersza od rezerwacji.
 * Wartości zmierzone w Chromium (`text-sm`, 1024–1920 px): `w-60 max-w-60` = 240 px mieści
 * najdłuższą tożsamość i pełne `owner/repo` w `font-mono` (`longtails/legacy-reports` = 210 px),
 * `w-16 max-w-16` = 64 px mieści nazwy zespołów (`DEV`, `QA`) oraz myślnik dla braku wartości.
 * Sufit zostaje na wypadek dłuższych danych z backendu — wtedy komórka się ucina, zamiast
 * rozsadzać całą tabelę.
 */
export const COLUMN_WIDTH = {
  user: 'w-60 max-w-60',
  team: 'w-16 max-w-16',
  repository: 'w-60 max-w-60',
} as const;

/**
 * Kolumny drugiego planu — poniżej `2xl` (1536 px) schodzą z drogi kolumnom decyzyjnym
 * (`Status`, `Rekomendacja`, `Akcje`) zamiast je wypychać poza ekran.
 *
 * Próg jest **wymierzony, nie intuicyjny**: przy 1440 px kontener ma 1152 px, a komplet dziewięciu
 * kolumn bez ucinania tekstu potrzebuje 1258 px (`table-layout: auto` bierze `max-content` komórek),
 * więc `xl` zostawiałoby 108 px poziomego przewijania i wciskało `Rekomendację` pod przyklejoną
 * kolumnę akcji. Nie „poprawiaj” tego z powrotem na `xl`.
 *
 * `table-cell`, a nie `block`, bo przywracamy natywny display komórki tabeli; ta sama klasa idzie
 * na nagłówek i na komórkę, żeby wiersze pozostały wyrównane.
 */
export const SECONDARY_COLUMN = 'hidden 2xl:table-cell';

/**
 * Ostatnia kolumna (nagłówek `Akcje` + przycisk `Decyzja`) jedzie przyklejona do prawej krawędzi
 * kontenera, więc akcja wiersza jest w zasięgu przy każdej szerokości. Tło musi być nieprzezroczyste
 * i równe powierzchni, na której leży wiersz — widocznym tłem jest `--background` (`body`), nie
 * `--card`; inaczej przewijane kolumny przeświecają pod przyciskiem. Obramowanie z lewej oddziela
 * przyklejoną kolumnę od przewijanej treści.
 */
export const ACTION_COLUMN = 'sticky right-0 border-l bg-background text-center';
