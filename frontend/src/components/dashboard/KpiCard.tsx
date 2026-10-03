import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { getStatusBadge } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';
import type { LeaseStatus } from '@/types/api';

/**
 * Tonacja karty KPI: status dzierżawy albo doradcza rodzina `DOWNSCOPE` (DESIGN.md §1, §4).
 * Rekomendacja deeskalacji nie jest statusem dzierżawy, ale ma własną rodzinę tokenów.
 */
export type KpiTone = LeaseStatus | 'DOWNSCOPE';

export type KpiCardProps = React.ComponentProps<'div'> & {
  label: string;
  value: number;
  tone: KpiTone;
  hint?: string;
};

/**
 * Klasy tła i obramowania karty w rodzinie tonu.
 *
 * Statusy dzierżawy biorą je z `getStatusBadge` — jedynego mapowania status → kolor
 * (CODING_STANDARDS.md §3). Dla `DOWNSCOPE` sięgamy wprost po tokeny `status-downscope`,
 * bo `statusBadges` opisuje statusy, a nie rekomendacje.
 */
function getToneClassName(tone: KpiTone): string {
  if (tone === 'DOWNSCOPE') {
    return 'border-status-downscope-border bg-status-downscope-subtle text-status-downscope-foreground';
  }

  return getStatusBadge(tone).className;
}

export function KpiCard({
  label,
  value,
  tone,
  hint,
  className,
  ...props
}: KpiCardProps): React.JSX.Element {
  return (
    <Card className={cn('border', getToneClassName(tone), className)} {...props}>
      <CardHeader>
        <CardDescription className="flex items-center gap-2 text-xs font-medium text-current">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="font-mono text-2xl tabular-nums">{value}</p>
        {hint === undefined ? null : <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
