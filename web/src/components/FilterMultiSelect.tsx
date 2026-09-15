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

  return (
    <div className={` inline-flex w-56 min-w-0 max-w-full  ${className ?? ''}  `}>
      <Combobox
        items={allItems}
        multiple
        value={value}
        onValueChange={(nextValues) => onChange(nextValues as string[])}
      >
        <ComboboxChips>
          {value.length === 1 && (
            <ComboboxChip removeProps={{ 'aria-label': `Remove ${value[0]}` }}>
              {renderOption ? renderOption(value[0]) : value[0]}
            </ComboboxChip>
          )}

          {value.length > 1 && (
            <span className="flex items-center px-2">
              {value.length} {summaryNoun}
            </span>
          )}

          <ComboboxChipsInput aria-label={label} placeholder={value.length === 0 ? label : undefined} />

          <ComboboxTrigger />
        </ComboboxChips>

        <ComboboxPopup>
          <ComboboxEmpty>No options found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {renderOption ? renderOption(item) : item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
    </div>
  )
}
