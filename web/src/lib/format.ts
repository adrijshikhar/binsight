// fmtBytes renders a byte count with a space before a scaled unit,
// e.g. 75 → "75 B", 1536 → "1.5 KB", 3221225 → "3.1 MB".
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
