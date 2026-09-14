import * as React from 'react'
import {
  Combobox,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxChip,
  ComboboxPopup,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxTrigger,
} from '@/components/ui/combobox'

export interface FilterMultiSelectProps {
  label: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  summaryNoun: string
  renderOption?: (value: string) => React.ReactNode
  className?: string
}

export default function FilterMultiSelect({
  label,
  options,
  value,
  onChange,
  summaryNoun,
  renderOption,
  className,
}: FilterMultiSelectProps): React.ReactElement {
  // Ensure options include any currently selected values so they remain accessible
  const allItems = React.useMemo(() => {
    const set = new Set(options)
    for (const v of value) {
      set.add(v)
    }
    return Array.from(set)
  }, [options, value])

  const handleRemove = (valToRemove: string) => {
    onChange(value.filter((v) => v !== valToRemove))
  }

  return (
    <div className={`relative inline-flex min-w-[130px] max-w-[200px] ${className ?? ''}`}>
      <Combobox
        items={allItems}
        multiple
        value={value}
        onValueChange={(nextValues) => onChange(nextValues as string[])}
      >


        <ComboboxChips className="min-h-7 h-7 py-0 px-1.5 flex-nowrap overflow-hidden text-xs">
          {value.length === 1 && (
            <ComboboxChip className="h-5 shrink-0 max-w-[120px] truncate">
              {renderOption ? renderOption(value[0]) : value[0]}
            </ComboboxChip>
          )}

          {value.length > 1 && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-mono bg-surface-2 text-foreground border border-border">
              {value.length} {summaryNoun}
            </span>
          )}

          <ComboboxChipsInput
            aria-label={label}
            placeholder={value.length === 0 ? label : undefined}
            size="sm"
            className="h-6 min-w-8 text-xs py-0"
          />

          <ComboboxTrigger className="p-1 end-1" />
        </ComboboxChips>

        <ComboboxPopup>
          <ComboboxEmpty className="py-2 text-xs text-muted-foreground">
            No options found.
          </ComboboxEmpty>
          <ComboboxList className="max-h-52 overflow-y-auto">
            {(item) => (
              <ComboboxItem
                key={item}
                value={item}
                className="text-xs py-1 px-2 cursor-pointer"
              >
                {renderOption ? renderOption(item) : item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
    </div>
  )
}
