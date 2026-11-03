import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/shared/utils';
import { CONTROL_HEIGHT } from '@/components/ui/control-styles';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow] disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Dark text on the orange fill in both themes: white on orange is about 1.9:1 in light.
        default:
          'bg-primary text-foreground shadow-xs hover:bg-primary/90 dark:text-primary-foreground disabled:bg-muted disabled:text-muted-foreground dark:disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none',
        // The landing CTA style: blue with white text in light, orange with dark text in dark.
        brand:
          'bg-brand text-primary-foreground shadow-xs hover:bg-brand/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground aria-pressed:bg-muted aria-pressed:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 dark:aria-pressed:bg-input',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: `${CONTROL_HEIGHT.default} px-4 py-2 has-[>svg]:px-3`,
        sm: `${CONTROL_HEIGHT.sm} rounded-md gap-1.5 px-3 has-[>svg]:px-2.5`,
        lg: 'h-11 md:h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-11 md:size-9',
        // Small actions in toolbars and chart headers (export, reset, expand all, toggles).
        // Same height as segmented controls and selects in the row.
        xs: `${CONTROL_HEIGHT.sm} gap-1.5 px-3 text-xs leading-none has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5`,
        'icon-xs': 'size-11 md:size-8',
        // Dense chips inside a chart body, where a 32px row would crowd the plot.
        '2xs': "h-7 gap-1.5 px-2.5 text-xs leading-none [&_svg:not([class*='size-'])]:size-3.5",
        'icon-2xs': 'size-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp: React.ElementType = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
