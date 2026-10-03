import type { BaselineResponse } from '@/api/baseline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getRoleLabel } from '@/lib/statusBadges';

export interface BaselineTableProps {
  response: BaselineResponse;
}

/**
 * Propozycje standardu zespołu (UC-1): repozytorium, proponowana rola i udział aktywnych
 * członków. Etykieta roli pochodzi wyłącznie z `lib/statusBadges.ts` — poziom `admin` nie ma
 * tu prawa się pojawić, bo ADR 0005 wyklucza go ze standardu.
 */
export function BaselineTable({ response }: BaselineTableProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Propozycje dostępu</CardTitle>
        <CardDescription>
          Repozytoria, w których w ostatnich 30 dniach pracowało co najmniej 50% członków zespołu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {response.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Za mało aktywnych członków w ostatnich 30 dniach — ten zespół nie ma jeszcze propozycji
            standardu.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repozytorium</TableHead>
                <TableHead>Proponowana rola</TableHead>
                <TableHead>Aktywni członkowie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {response.entries.map((entry) => (
                <TableRow key={entry.repository.id}>
                  <TableCell className="font-mono">
                    {entry.repository.owner}/{entry.repository.name}
                  </TableCell>
                  <TableCell>{getRoleLabel(entry.proposed_role)}</TableCell>
                  <TableCell>
                    {entry.active_members}/{entry.team_size}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Szkielet w układzie docelowym tabeli — widok nigdy nie pokazuje spinnera w środku treści. */
export function BaselineTableSkeleton(): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-80" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}
