import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
        // Statusy dzierżaw, rekomendacji i odwołań — kolory wyłącznie z tokenów `--status-*`
        // (DESIGN.md §1). Etykiety pochodzą z `lib/statusBadges.ts`, nigdy z tego pliku.
        'status-active':
          'border-status-active-border bg-status-active-subtle text-status-active-foreground',
        'status-warning':
          'border-status-warning-border bg-status-warning-subtle text-status-warning-foreground',
        'status-expired':
          'border-status-expired-border bg-status-expired-subtle text-status-expired-foreground',
        'status-downscope':
          'border-status-downscope-border bg-status-downscope-subtle text-status-downscope-foreground',
        'status-revoke':
          'border-status-revoke-border bg-status-revoke-subtle text-status-revoke-foreground',
        // „Bez zmian” (KEEP) nie ma własnego koloru — brak sygnału jest sygnałem.
        'status-keep': 'border-border bg-muted text-muted-foreground',
        // Statusy odwołań dziedziczą rodziny znaczeniowe (patrz DESIGN.md §1).
        'status-pending':
          'border-status-warning-border bg-status-warning-subtle text-status-warning-foreground',
        'status-approved':
          'border-status-active-border bg-status-active-subtle text-status-active-foreground',
        'status-rejected':
          'border-status-expired-border bg-status-expired-subtle text-status-expired-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
