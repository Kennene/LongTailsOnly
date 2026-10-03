import { useState } from 'react';
import { toast } from 'sonner';

import type { NewMember } from '@/api/baseline';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApproveBaseline } from '@/hooks/useApproveBaseline';

export interface BaselineApprovalProps {
  team_slug: string;
  members: NewMember[];
}

/**
 * Onboarding nowego członka zespołu jednym kliknięciem (UC-1): wybór osoby z listy `new_members`
 * i zatwierdzenie standardu. Sukces potwierdza toast, błąd pokazujemy w miejscu akcji, żeby
 * administrator nie musiał zgadywać, czy standard został nadany.
 */
export function BaselineApproval({ team_slug, members }: BaselineApprovalProps): React.JSX.Element {
  const [selectedLogin, setSelectedLogin] = useState<string>(members[0]?.login ?? '');
  const approve = useApproveBaseline();
  const selectId = `baseline-new-member-${team_slug}`;

  function handleApprove(): void {
    approve.mutate(
      { team_slug, user_login: selectedLogin },
      { onSuccess: () => toast.success('Standard zatwierdzony') },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding nowego członka</CardTitle>
        <CardDescription>
          Zatwierdzenie standardu nada dostęp zgodny z propozycjami powyżej — bez ręcznego
          konfigurowania każdego repozytorium.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak nowych członków do zatwierdzenia.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={selectId}>Nowy członek zespołu</Label>
              <Select value={selectedLogin} onValueChange={setSelectedLogin}>
                <SelectTrigger id={selectId} className="w-full max-w-xs">
                  <SelectValue placeholder="Wybierz osobę" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.login} value={member.login}>
                      {member.name} ({member.login})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              className="self-start"
              disabled={approve.isPending}
              onClick={handleApprove}
            >
              Zatwierdź standard
            </Button>
            {approve.error === null ? null : (
              <Alert variant="destructive">
                <AlertTitle>Nie udało się zatwierdzić standardu</AlertTitle>
                <AlertDescription>{approve.error.message}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
