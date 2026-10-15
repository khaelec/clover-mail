import { useEffect, useState } from 'react'
import { isNative } from './mobile'

/** Phone-width viewport or the native shell: show one pane at a time. */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(
    () => isNative() || (typeof window !== 'undefined' && window.innerWidth < 820)
  )
  useEffect(() => {
    if (isNative()) return
    const onResize = (): void => setCompact(window.innerWidth < 820)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return compact
}
