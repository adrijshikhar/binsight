import { ActionIcon, Tooltip, useMantineColorScheme, useComputedColorScheme } from '@mantine/core'
import { IconSun, IconMoon } from '@tabler/icons-react'

// Light/dark scheme toggle. Mantine persists the choice in localStorage and
// flips the `data-mantine-color-scheme` attribute on <html>; the theme +
// scheme-aware CSS variables (global.css) do the rest. `getInitialValueInEffect`
// avoids an SSR/initial-paint mismatch on the computed scheme.
export default function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const scheme = useComputedColorScheme('dark', { getInitialValueInEffect: true })
  const next = scheme === 'dark' ? 'light' : 'dark'
  return (
    <Tooltip label={`Switch to ${next} theme`} withArrow>
      <ActionIcon
        variant="subtle"
        color="gray"
        ml="auto"
        onClick={() => setColorScheme(next)}
        aria-label={`Switch to ${next} theme`}
      >
        {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  )
}
