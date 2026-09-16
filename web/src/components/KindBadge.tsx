import type React from 'react'
import { Badge } from '@/components/ui/badge'
import { kindToBadgeVariant, type EventBadgeVariant } from './icons'

export function kindToDataAttr(typeName: string): string {
  if (typeName.startsWith('WRITE_ROWS')) return 'WRITE'
  if (typeName.startsWith('UPDATE_ROWS')) return 'UPDATE'
  if (typeName.startsWith('DELETE_ROWS')) return 'DELETE'
  if (typeName === 'QUERY') return 'QUERY'
  if (typeName === 'XID') return 'XID'
  if (typeName === 'TABLE_MAP') return 'TABLE_MAP'
  if (typeName.includes('GTID')) return 'GTID'
  if (typeName === 'CREATE') return 'CREATE'
  if (typeName === 'ALTER') return 'ALTER'
  if (typeName === 'DROP') return 'DROP'
  if (typeName === 'TRUNCATE') return 'TRUNCATE'
  return 'default'
}

export { kindToBadgeVariant, type EventBadgeVariant }

export interface KindBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  typeName: string
  size?: 'sm' | 'default' | 'lg'
}

export default function KindBadge({ typeName, className, size = 'sm', ...rest }: KindBadgeProps): React.ReactElement {
  const variant = kindToBadgeVariant(typeName)
  return (
    <Badge
      variant={variant}
      data-variant={variant}
      size={size}
      className={className}
      data-kind={kindToDataAttr(typeName)}
      {...rest}
    >
      {typeName}
    </Badge>
  )
}
