import type * as React from 'react'
import { IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export interface FilterChipProps {
  children: React.ReactNode
  removeLabel: string
  onRemove: () => void
  tone?: 'neutral' | 'brand'
  className?: string
}

export function FilterChip({
  children,
  removeLabel,
  onRemove,
  tone = 'neutral',
  className,
}: FilterChipProps): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border text-xs font-mono h-5 px-1.5 shrink-0 transition-colors',
        tone === 'brand'
          ? 'bg-[var(--selection)] text-[var(--brand-foreground)] border-[var(--border)]'
          : 'bg-[var(--surface-2)] text-[var(--foreground-secondary)] border-[var(--border)]',
        className,
      )}
      data-slot="filter-chip"
    >
      <span className="truncate inline-flex items-center leading-none">{children}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="inline-flex items-center justify-center size-3.5 rounded-xs text-muted-foreground hover:text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0 cursor-pointer transition-colors"
      >
        <IconX size={10} stroke={2.5} />
      </button>
    </span>
  )
}
