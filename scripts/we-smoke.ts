import { detectWallpaperEngine, findSteamPath } from '../src/main/wallpaper/engine'

const steam = findSteamPath()
const detection = detectWallpaperEngine()

console.log('steamPath:', steam)
console.log(
  JSON.stringify(
    {
      installed: detection.installed,
      engineDirs: detection.dirs,
      total: detection.wallpapers.length,
      supported: detection.wallpapers.filter((w) => w.supported).length,
      byType: detection.wallpapers.reduce<Record<string, number>>((acc, w) => {
        acc[w.type] = (acc[w.type] ?? 0) + 1
        return acc
      }, {}),
      sample: detection.wallpapers.slice(0, 6).map((w) => ({
        title: w.title,
        type: w.type,
        kind: w.kind,
        supported: w.supported,
        hasPreview: Boolean(w.preview)
      }))
    },
    null,
    2
  )
)
