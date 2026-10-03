import { useState } from 'react';
import { toast } from 'sonner';

import { AppealForm } from '@/components/appeals/AppealForm';
import { AppealListItem } from '@/components/appeals/AppealListItem';
import { LeaseCandidatesTable } from '@/components/appeals/LeaseCandidatesTable';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppeals } from '@/hooks/useAppeals';
import { useLeases } from '@/hooks/useLeases';
import { useSubmitAppeal } from '@/hooks/useSubmitAppeal';
import { type ApiErrorDescription, describeApiError, describeEngineError } from '@/lib/apiErrors';
import { isAppealable } from '@/lib/appealable';
import type { AppealOverview, LeaseOverview } from '@/types/api';

const APPEALS_LIST_HEADING_ID = 'appeals-submitted-heading';
const SUBMIT_APPEAL_FALLBACK = 'Nie udało się złożyć odwołania.';
const EMPTY_CANDIDATES =
  'Brak dostępów do odwołania — odwołanie przysługuje odebranym dostępom oraz tym, które wygasły albo wygasają w ciągu 7 dni.';

export function AppealsPage(): React.JSX.Element {
  const leasesQuery = useLeases();
  const appealsQuery = useAppeals();
  const submitAppeal = useSubmitAppeal();
  const [selectedAppeal, setSelectedAppeal] = useState<AppealOverview | null>(null);

  const leases: LeaseOverview[] = leasesQuery.data ?? [];
  // Ta sama reguła, którą stosuje `appeal_service.submit_appeal` (`appeal_rules.is_appealable`) —
  // inaczej lista oferowałaby dostępy, których silnik i tak nie przyjmie (409).
  const candidates: LeaseOverview[] = leases.filter(isAppealable);
  const appeals: AppealOverview[] = appealsQuery.data ?? [];
  const submitFailure: ApiErrorDescription | null =
    submitAppeal.error === null
      ? null
      : describeEngineError(submitAppeal.error, 'APPEAL_SUBMIT', SUBMIT_APPEAL_FALLBACK);

  function handleSubmit(lease_id: number, justification: string): void {
    submitAppeal.mutate(
      { lease_id, justification },
      {
        onSuccess: (): void => {
          toast.success('Odwołanie złożone');
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Odwołania</h1>
        <p className="text-sm text-muted-foreground">
          Każde odwołanie wymaga nowego uzasadnienia biznesowego — decyzję podejmuje administrator
          (celowe tarcie procesowe, ADR 0005).
        </p>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Dostępy wymagające uwagi</CardTitle>
          <CardDescription>
            Odwołanie przysługuje dostępom odebranym oraz tym, które wygasły albo wygasają w ciągu 7
            dni.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leasesQuery.isPending ? (
            <div className="flex flex-col gap-2" role="status">
              <span className="sr-only">Wczytywanie dostępów wymagających uwagi…</span>
              <Skeleton aria-hidden className="h-10 w-full" />
              <Skeleton aria-hidden className="h-9 w-full" />
            </div>
          ) : null}

          {leasesQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się pobrać dostępów</AlertTitle>
              <AlertDescription>
                {leasesQuery.error === null
                  ? 'Nieznany błąd'
                  : describeApiError(leasesQuery.error, 'Nie udało się pobrać dostępów.')}
              </AlertDescription>
              <AlertAction>
                <Button onClick={() => void leasesQuery.refetch()} size="sm" variant="outline">
                  Odśwież
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {leasesQuery.isSuccess && candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{EMPTY_CANDIDATES}</p>
          ) : null}

          {leasesQuery.isSuccess && candidates.length > 0 ? (
            <LeaseCandidatesTable leases={candidates} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Nowe odwołanie</CardTitle>
          <CardDescription>Uzasadnienie jest wymagane i nie może się powtarzać.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {leasesQuery.isPending ? (
            <div className="flex flex-col gap-2" role="status">
              <span className="sr-only">Wczytywanie listy dostępów do odwołania…</span>
              <Skeleton aria-hidden className="h-10 w-full" />
              <Skeleton aria-hidden className="h-9 w-full" />
            </div>
          ) : null}

          {leasesQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              Formularz pojawi się, gdy lista dostępów zostanie pobrana.
            </p>
          ) : null}

          {leasesQuery.isSuccess && candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nie ma czego przedłużać — żaden dostęp nie podlega odwołaniu.
            </p>
          ) : null}

          {leasesQuery.isSuccess && candidates.length > 0 ? (
            // `key` resetuje wybór dostępu, gdy kandydaci się zmienią (np. po przedłużeniu
            // albo resecie scenariusza) — inaczej formularz wysłałby nieaktualne `lease_id`.
            <AppealForm
              isSubmitting={submitAppeal.isPending}
              key={candidates.map((lease: LeaseOverview): number => lease.id).join('-')}
              leases={candidates}
              onSubmit={handleSubmit}
            />
          ) : null}

          {submitFailure === null ? null : (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się złożyć odwołania</AlertTitle>
              <AlertDescription>
                {submitFailure.message}
                {submitFailure.detail === null ? null : (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {submitFailure.detail}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle id={APPEALS_LIST_HEADING_ID}>Złożone odwołania</CardTitle>
          <CardDescription>
            Najnowsze pierwsze; pozycje oczekujące czekają na decyzję.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {appealsQuery.isPending ? (
            <div className="flex flex-col gap-2" role="status">
              <span className="sr-only">Wczytywanie złożonych odwołań…</span>
              <Skeleton aria-hidden className="h-10 w-full" />
              <Skeleton aria-hidden className="h-9 w-full" />
            </div>
          ) : null}

          {appealsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się pobrać odwołań</AlertTitle>
              <AlertDescription>
                {appealsQuery.error === null
                  ? 'Nieznany błąd'
                  : describeApiError(appealsQuery.error, 'Nie udało się pobrać odwołań.')}
              </AlertDescription>
              <AlertAction>
                <Button onClick={() => void appealsQuery.refetch()} size="sm" variant="outline">
                  Odśwież
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {appealsQuery.isSuccess && appeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak złożonych odwołań — wybierz dostęp powyżej i uzasadnij wniosek.
            </p>
          ) : null}

          {appealsQuery.isSuccess && appeals.length > 0 ? (
            <ul aria-labelledby={APPEALS_LIST_HEADING_ID} className="flex flex-col">
              {appeals.map((appeal: AppealOverview): React.JSX.Element => (
                <AppealListItem appeal={appeal} key={appeal.id} onResolve={setSelectedAppeal} />
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {/* Tryb odwołania czyta cały kontekst z `AppealOverview`, więc `lease` zostaje `null`:
          rozpatrzenie nie zależy od tego, czy dostęp trafił na listę `useLeases()`. */}
      <DecisionModal
        appeal={selectedAppeal}
        lease={null}
        onOpenChange={(open: boolean): void => {
          if (!open) {
            setSelectedAppeal(null);
          }
        }}
        open={selectedAppeal !== null}
      />
    </section>
  );
}
