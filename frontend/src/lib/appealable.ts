import type { LeaseOverview, LeaseStatus } from '@/types/api';

/**
 * Czy z tej dzierżawy wolno złożyć odwołanie — odpowiednik `is_appealable`
 * (`backend/app/domain/appeal_rules.py`), które woła `appeal_service.submit_appeal`:
 * odebrana dzierżawa zawsze, `PERMANENT` (admin albo brak terminu) nigdy, a dzierżawa
 * w oknie ostrzegawczym (7 dni, ADR 0002) albo już wygasła — tak. Dokładnie te same
 * przypadki rozstrzyga `lease_rules.lease_status`, więc status niesie całą potrzebną wiedzę.
 *
 * `switch` bez `default` jest kompletny: nowy status w `LeaseStatus` przestanie się tu
 * kompilować i wymusi decyzję, zamiast po cichu wypaść z listy kandydatów.
 */
export function isAppealable(lease: LeaseOverview): boolean {
  const status: LeaseStatus = lease.status;

  switch (status) {
    case 'REVOKED':
    case 'WARNING':
    case 'EXPIRED':
      return true;
    case 'ACTIVE':
    case 'PERMANENT':
      return false;
  }
}
