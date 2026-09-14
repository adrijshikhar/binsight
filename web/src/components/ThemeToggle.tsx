import { IconSun, IconMoon } from '@tabler/icons-react'
import { useColorScheme } from '@/lib/colorScheme'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'

export default function ThemeToggle() {
  const { resolved, setPreference } = useColorScheme()
  const next = resolved === 'dark' ? 'light' : 'dark'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-muted-foreground hover:text-foreground h-7 w-7"
            onClick={() => setPreference(next)}
            aria-label={`Switch to ${next} theme`}
          />
        }
      >
        {resolved === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
      </TooltipTrigger>
      <TooltipPopup>
        <span>Switch to {next} theme</span>
      </TooltipPopup>
    </Tooltip>
  )
}
