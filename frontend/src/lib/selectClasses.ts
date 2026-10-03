/**
 * Wspólny rdzeń klas natywnego `<select>` — jedno źródło prawdy dla czterech kontrolek
 * (`AppealForm`, `GraphFilters`, `AuditFilters` i `ServicePicker`), bo `CODING_STANDARDS.md` §1.2
 * zakazuje trzech kopii tego samego stringa, a kontrolka usługi byłaby czwartą (spec §6).
 *
 * Wynosimy dokładnie ten fragment, który mają wszystkie trzy pola; różnice zostają w miejscu użycia
 * (`px-2`, `w-full`, `disabled:*`, `sm:w-40`), żeby refaktor nie zmienił wyglądu ani jednego z nich.
 * Poziomy padding celowo **nie** należy do rdzenia: kontrolka usługi potrzebuje `pr-7` na natywną
 * strzałkę, a `cn` nie skraca `px-*` przez późniejsze `pr-*`/`pl-*` — w atrybucie zostałaby martwa
 * klasa, której wynik zależałby od kolejności reguł w arkuszu. Wysokość `h-8` jest w rdzeniu,
 * bo wszystkie cztery kontrolki są rozmiaru chrome.
 */
export const SELECT_CLASSES =
  'h-8 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';
