/** Draw a red count badge (as a PNG data URL) for the Windows taskbar overlay. */
export function badgeDataUrl(count: number): string {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  const label = count > 99 ? '99+' : String(count)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${label.length > 2 ? 11 : label.length > 1 ? 15 : 19}px 'Segoe UI', sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, size / 2, size / 2 + 1)
  return canvas.toDataURL('image/png')
}

/** Push the combined unread count to the tray tooltip and the taskbar badge. */
export function applyUnreadBadge(count: number): void {
  const total = Math.max(0, count)
  window.clover.setUnread(total)
  window.clover.setTaskbarBadge(
    total > 0 ? badgeDataUrl(total) : '',
    total > 0 ? `${total} unread` : ''
  )
}
