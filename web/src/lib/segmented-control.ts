import { cva } from 'class-variance-authority'

export type SegmentedControlSize = 'default' | 'lg' | 'sm'

export const segmentedControlItemSizeClassNames: Record<
  SegmentedControlSize,
  string
> = {
  default: 'h-8 px-[calc(--spacing(2.5)-1px)] sm:h-7',
  lg: 'h-9 px-[calc(--spacing(3)-1px)] sm:h-8',
  sm: 'h-7 px-[calc(--spacing(2)-1px)] sm:h-6',
}

export const segmentedControlRootClassName =
  'relative z-0 flex w-fit min-h-7 items-center justify-center gap-0.5 rounded-full border border-border bg-muted p-0.5'

export const segmentedControlItemLayoutClassName =
  'gap-1.5 [&_svg:not([class*=\'opacity-\'])]:opacity-80 [&_svg:not([class*=\'size-\'])]:size-4.5 sm:[&_svg:not([class*=\'size-\'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0'

export const segmentedControlItemVariants = cva(
  [
    'relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-full border border-transparent font-medium text-base text-muted-foreground/72 outline-2 outline-transparent transition-[outline-color] hover:bg-transparent hover:text-muted-foreground focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-64 data-disabled:pointer-events-none data-disabled:opacity-64 sm:text-sm',
    segmentedControlItemLayoutClassName,
  ],
  {
    defaultVariants: {
      size: 'default',
    },
    variants: {
      size: {
        default: 'h-8 px-[calc(--spacing(3)-1px)] sm:h-7',
        lg: 'h-9 px-[calc(--spacing(3.5)-1px)] sm:h-8',
        sm: 'h-7 px-[calc(--spacing(2.5)-1px)] sm:h-6',
      },
      state: {
        checked:
          'data-checked:bg-surface-2 data-checked:text-foreground data-checked:[box-shadow:var(--panel-highlight)]',
        current:
          'aria-[current=page]:bg-surface-2 aria-[current=page]:text-foreground aria-[current=page]:[box-shadow:var(--panel-highlight)]',
        pressed:
          'data-pressed:bg-surface-2 data-pressed:text-foreground data-pressed:[box-shadow:var(--panel-highlight)]',
      },
    },
  },
)
