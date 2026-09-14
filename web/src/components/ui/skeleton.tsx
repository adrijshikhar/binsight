import type React from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted/60',
        className,
      )}
      data-slot="skeleton"
      {...props}
    />
  )
}
