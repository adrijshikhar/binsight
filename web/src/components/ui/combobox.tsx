import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { ChevronsUpDownIcon, XIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

export const ComboboxContext: React.Context<{
  chipsRef: React.RefObject<Element | null> | null
  multiple: boolean
}> = React.createContext<{
  chipsRef: React.RefObject<Element | null> | null
  multiple: boolean
}>({
  chipsRef: null,
  multiple: false,
})

export function Combobox<
  Value,
  Multiple extends boolean | undefined = false,
  Item = Value,
>(
  props: ComboboxPrimitive.Root.Props<Value, Multiple, Item>,
): React.ReactElement {
  const chipsRef = React.useRef<Element | null>(null)
  return (
    <ComboboxContext.Provider value={{ chipsRef, multiple: !!props.multiple }}>
      <ComboboxPrimitive.Root {...props} />
    </ComboboxContext.Provider>
  )
}

export function ComboboxChipsInput({
  className,
  size,
  ...props
}: Omit<ComboboxPrimitive.Input.Props, 'size'> & {
  size?: 'sm' | 'default' | 'lg' | number
  ref?: React.Ref<HTMLInputElement>
}): React.ReactElement {
  const sizeValue = (size ?? 'default') as 'sm' | 'default' | 'lg' | number

  return (
    <ComboboxPrimitive.Input
      className={cn(
        'min-w-12 flex-1 text-base text-foreground outline-none sm:text-sm [[data-slot=combobox-chip]+&]:ps-1',
        sizeValue === 'sm' && 'sm:text-xs',
        className,
      )}
      data-size={typeof sizeValue === 'string' ? sizeValue : undefined}
      data-slot="combobox-chips-input"
      size={typeof sizeValue === 'number' ? sizeValue : undefined}
      {...props}
    />
  )
}

export function ComboboxInput({
  className,
  size = 'default',
  ...props
}: Omit<ComboboxPrimitive.Input.Props, 'size'> & {
  size?: 'sm' | 'default' | 'lg' | number
}): React.ReactElement {

  return (
    <ComboboxPrimitive.Input
      className={className}
      data-slot="combobox-input"
      render={<Input nativeInput size={size} />}
      {...props}
    />
  )
}

export function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.Trigger
      className={cn(
        'absolute end-0 top-1/2 -translate-y-1/2 cursor-pointer p-2 opacity-80 hover:opacity-100 [&_svg:not([class*=\'size-\'])]:size-4.5 sm:[&_svg:not([class*=\'size-\'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        className,
      )}
      data-slot="combobox-trigger"
      {...props}
    >
      {children || <ChevronsUpDownIcon />}
    </ComboboxPrimitive.Trigger>
  )
}

export function ComboboxPopup({
  className,
  children,
  sideOffset = 4,
  ...props
}: ComboboxPrimitive.Popup.Props & {
  sideOffset?: number
}): React.ReactElement {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        className="z-50 select-none"
        data-slot="combobox-positioner"
        sideOffset={sideOffset}
      >
        <span
          className={cn(
            'relative flex max-h-[min(var(--available-height),23rem)] w-(--anchor-width) min-w-36 flex-col rounded-lg border bg-popover text-popover-foreground [box-shadow:var(--panel-highlight)] outline-none transition-[scale,opacity] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0',
            className,
          )}
        >
          <ComboboxPrimitive.Popup
            className="flex max-h-[min(var(--available-height),23rem)] flex-1 flex-col text-foreground"
            data-slot="combobox-popup"
            {...props}
          >
            {children}
          </ComboboxPrimitive.Popup>
        </span>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

export function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        'grid min-h-8 in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)] cursor-default grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-sm py-1 ps-2 pe-4 text-base outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-64 sm:min-h-7 sm:text-sm [&_svg:not([class*=\'size-\'])]:size-4.5 sm:[&_svg:not([class*=\'size-\'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        className,
      )}
      data-slot="combobox-item"
      {...props}
    >
      <ComboboxPrimitive.ItemIndicator className="col-start-1">
        <svg
          aria-hidden="true"
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      </ComboboxPrimitive.ItemIndicator>
      <div className="wrap-anywhere col-start-2 min-w-0">{children}</div>
    </ComboboxPrimitive.Item>
  )
}

export function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.Separator
      className={cn('mx-2 my-1 h-px bg-border last:hidden', className)}
      data-slot="combobox-separator"
      {...props}
    />
  )
}

export function ComboboxGroup({
  className,
  ...props
}: ComboboxPrimitive.Group.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.Group
      className={cn('[[role=group]+&]:mt-1.5', className)}
      data-slot="combobox-group"
      {...props}
    />
  )
}

export function ComboboxGroupLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.GroupLabel
      className={cn(
        'px-2 py-1.5 font-medium text-muted-foreground text-xs',
        className,
      )}
      data-slot="combobox-group-label"
      {...props}
    />
  )
}

export function ComboboxEmpty({
  className,
  ...props
}: ComboboxPrimitive.Empty.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.Empty
      className={cn(
        'not-empty:p-2 text-center text-base text-muted-foreground sm:text-sm',
        className,
      )}
      data-slot="combobox-empty"
      {...props}
    />
  )
}

export function ComboboxRow({
  className,
  ...props
}: ComboboxPrimitive.Row.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.Row
      className={className}
      data-slot="combobox-row"
      {...props}
    />
  )
}

export const ComboboxValue: typeof ComboboxPrimitive.Value =
  ComboboxPrimitive.Value

export function ComboboxList({
  className,
  ...props
}: ComboboxPrimitive.List.Props): React.ReactElement {
  return (
    <ScrollArea overscrollContain scrollbarGutter scrollFade>
      <ComboboxPrimitive.List
        className={cn(
          'not-empty:scroll-py-1 not-empty:px-1 not-empty:py-1 in-data-has-overflow-y:pe-3',
          className,
        )}
        data-slot="combobox-list"
        {...props}
      />
    </ScrollArea>
  )
}

export function ComboboxClear({
  className,
  ...props
}: ComboboxPrimitive.Clear.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.Clear
      className={className}
      data-slot="combobox-clear"
      {...props}
    />
  )
}

export function ComboboxStatus({
  className,
  ...props
}: ComboboxPrimitive.Status.Props): React.ReactElement {
  return (
    <ComboboxPrimitive.Status
      className={cn(
        'px-3 py-2 font-medium text-muted-foreground text-xs empty:m-0 empty:p-0',
        className,
      )}
      data-slot="combobox-status"
      {...props}
    />
  )
}

export const ComboboxCollection: typeof ComboboxPrimitive.Collection =
  ComboboxPrimitive.Collection

export function ComboboxChips({
  className,
  children,
  startAddon,
  ...props
}: ComboboxPrimitive.Chips.Props & {
  startAddon?: React.ReactNode
}): React.ReactElement {
  const { chipsRef } = React.useContext(ComboboxContext)

  return (
    <ComboboxPrimitive.Chips
      className={cn(
        'relative inline-flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background p-1 text-sm outline-none ring-ring/24 transition-shadow focus-within:border-ring focus-within:ring-2 has-disabled:pointer-events-none has-aria-invalid:border-destructive/36 has-disabled:opacity-64 focus-within:has-aria-invalid:border-destructive/64 focus-within:has-aria-invalid:ring-destructive/16 dark:not-has-disabled:bg-input/32 dark:has-aria-invalid:ring-destructive/24',
        className,
      )}
      data-slot="combobox-chips"
      ref={chipsRef as React.Ref<HTMLDivElement> | null}
      {...props}
    >
      {startAddon && (
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center ps-1 opacity-80"
          data-slot="combobox-start-addon"
        >
          {startAddon}
        </div>
      )}
      {children}
    </ComboboxPrimitive.Chips>
  )
}

export function ComboboxChip({
  children,
  removeProps,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  removeProps?: ComboboxPrimitive.ChipRemove.Props
}): React.ReactElement {
  return (
    <ComboboxPrimitive.Chip
      className="flex items-center rounded-sm bg-accent ps-1.5 font-medium text-accent-foreground text-xs outline-none"
      data-slot="combobox-chip"
      {...props}
    >
      {children}
      <ComboboxChipRemove {...removeProps} />
    </ComboboxPrimitive.Chip>
  )
}

export function ComboboxChipRemove(
  props: ComboboxPrimitive.ChipRemove.Props,
): React.ReactElement {
  return (
    <ComboboxPrimitive.ChipRemove
      aria-label="Remove"
      className="h-full shrink-0 cursor-pointer px-1 opacity-70 hover:opacity-100 [&_svg:not([class*=\'size-\'])]:size-3"
      data-slot="combobox-chip-remove"
      {...props}
    >
      <XIcon size={12} />
    </ComboboxPrimitive.ChipRemove>
  )
}

export const createComboboxItems: typeof ComboboxPrimitive.createItems =
  ComboboxPrimitive.createItems

export const useComboboxFilter: typeof ComboboxPrimitive.useFilter =
  ComboboxPrimitive.useFilter

export { ComboboxPrimitive }
