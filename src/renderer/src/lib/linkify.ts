/** Turn bare URLs in a contentEditable element's text nodes into real links. */
export function linkifyElement(editor: HTMLElement): void {
  const urlRe = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node as Text
    if (text.parentElement && text.parentElement.tagName === 'A') continue
    urlRe.lastIndex = 0
    if (urlRe.test(text.nodeValue ?? '')) targets.push(text)
  }
  for (const text of targets) {
    const value = text.nodeValue ?? ''
    const fragment = document.createDocumentFragment()
    let last = 0
    urlRe.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = urlRe.exec(value))) {
      if (match.index > last) fragment.appendChild(document.createTextNode(value.slice(last, match.index)))
      const raw = match[0]
      const anchor = document.createElement('a')
      anchor.href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
      anchor.textContent = raw
      fragment.appendChild(anchor)
      last = match.index + raw.length
    }
    if (last < value.length) fragment.appendChild(document.createTextNode(value.slice(last)))
    text.parentNode?.replaceChild(fragment, text)
  }
}
