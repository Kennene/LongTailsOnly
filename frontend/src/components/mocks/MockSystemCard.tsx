import { ExternalLink } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface MockSystem {
  name: string;
  description: string;
  basePath: string;
  groups: readonly string[];
  /** Osobny Swagger tego mocka serwuje backend (`app/api/mock_docs.py`); Vite przekazuje go przez proxy. */
  swaggerUrl: string;
}

interface MockSystemCardProps {
  system: MockSystem;
}

/** Karta jednego udawanego systemu: co udaje, pod jaką ścieżką i jakie grupy endpointów ma. */
export function MockSystemCard({ system }: MockSystemCardProps): React.JSX.Element {
  const headingId = `mock-${system.name.toLowerCase()}-heading`;

  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle id={headingId}>{system.name}</CardTitle>
        <CardDescription>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{system.basePath}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{system.description}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {system.groups.map((group: string): React.JSX.Element => (
            <li key={group} className="flex items-center gap-2">
              <span
                className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
                aria-hidden="true"
              />
              {group}
            </li>
          ))}
        </ul>
        <a
          href={system.swaggerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Swagger {system.name}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </CardContent>
    </Card>
  );
}
