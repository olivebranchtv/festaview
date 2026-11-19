// Works out a video's exact length in seconds: adds up the segments of an HLS playlist, or reads an MP4's metadata.
export async function detectDuration(url) {
  try {
    if (/\.m3u8(\?|$)/i.test(url)) {
      let text = await (await fetch(url)).text()
      if (text.includes('#EXT-X-STREAM-INF')) {
        const lines = text.split(/\r?\n/)
        const idx = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'))
        const uri = lines.slice(idx + 1).find((l) => l && !l.startsWith('#'))
        if (!uri) return 0
        text = await (await fetch(new URL(uri, url).toString())).text()
      }
      if (text.includes('#EXT-X-STREAM-INF') || !text.includes('#EXT-X-ENDLIST')) return 0
      const sum = [...text.matchAll(/#EXTINF:([\d.]+)/g)].reduce((a, m) => a + parseFloat(m[1]), 0)
      return sum > 0 ? Math.round(sum) : 0
    }
    return await new Promise((resolve) => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : 0)
      v.onerror = () => resolve(0)
      v.src = url
    })
  } catch { return 0 }
}
