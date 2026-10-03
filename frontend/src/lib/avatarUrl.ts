/**
 * Adres ilustrowanego awatara dla loginu — **generowany, nie fotografowany**.
 *
 * Demo używa fikcyjnych loginów, ale część z nich (`kamil`, `marta`, `ania`) koliduje z prawdziwymi
 * kontami na GitHubie, więc `github.com/<login>.png` wstawiłoby do konsoli twarze obcych, realnych
 * osób pod wymyślonymi personami. Generowana ilustracja jest unikalna dla loginu i nie przedstawia
 * nikogo.
 *
 * Styl `personas` jest **wybrany pomiarem, nie upodobaniem**: w docelowych 24 px (`size-6`) tylko on
 * czyta się jako głowa i ramiona. `notionists` (domyślny wybór DiceBeara) ma `viewBox` 1744 i figura
 * zajmuje w nim ułamek, więc w kole zostawała ciemna plama; `micah`, `open-peeps` i `adventurer` gubią
 * szczegół przy tej wielkości. Sprawdzone na zrzutach w ośmiu stylach obok siebie.
 *
 * `backgroundColor=transparent`, bo krąg awatara ma już własne neutralne tło z tokenów motywu —
 * drugie tło z zewnątrz rozjechałoby się z paletą (`DESIGN.md` §1).
 *
 * `size` jest podane w pikselach **fizycznych** (2× rozmiaru CSS `size-6` = 24 px), żeby obraz
 * był ostry na ekranach retina. Reguła jest deterministyczna: ten sam login daje ten sam obraz,
 * więc demo wygląda tak samo po każdym resecie.
 */
export function avatarUrl(login: string): string {
  const seed: string = encodeURIComponent(login);

  return `https://api.dicebear.com/9.x/personas/svg?seed=${seed}&backgroundColor=transparent&size=48`;
}
