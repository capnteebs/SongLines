/**
 * TheAudioDB API Integration
 *
 * TheAudioDB provides free artist images and metadata.
 * Free tier: 30 requests/minute
 *
 * API Key options:
 * - "2" = Free test key (limited)
 * - Get your own at: https://www.theaudiodb.com/api_guide.php
 */

// Configuration - use free test key or custom key from env
const API_KEY = import.meta.env.VITE_AUDIODB_API_KEY || '2'
const BASE_URL = 'https://www.theaudiodb.com/api/v1/json'

// Rate limiter: 30 requests/minute for free tier
// We use 1.2s interval for small bursts (5-7 images per search)
// This allows faster loading while staying well under the limit
class RateLimiter {
  private lastRequestTime = 0
  private readonly minInterval = 1200 // 1.2 seconds (allows ~50/min burst, we use ~7)

  async throttle(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed))
    }
    this.lastRequestTime = Date.now()
  }
}

const rateLimiter = new RateLimiter()

/**
 * Convert image URL to base64 data URL to bypass CORS for canvas rendering
 * Uses a CORS proxy since TheAudioDB's CDN doesn't send CORS headers
 */
async function toDataURL(url: string): Promise<string | undefined> {
  // List of CORS proxies to try (in order of preference)
  const corsProxies = [
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  ]

  for (const proxyFn of corsProxies) {
    try {
      const proxiedUrl = proxyFn(url)
      const response = await fetch(proxiedUrl)
      if (!response.ok) continue

      const blob = await response.blob()
      // Verify it's actually an image
      if (!blob.type.startsWith('image/')) continue

      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => resolve(undefined)
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      // Try next proxy
      continue
    }
  }

  console.warn('[TheAudioDB] All CORS proxies failed for:', url)
  return undefined
}

interface AudioDBArtist {
  idArtist: string
  strArtist: string
  strArtistThumb: string | null
  strArtistLogo: string | null
  strArtistCutout: string | null
  strArtistClearart: string | null
  strArtistWideThumb: string | null
  strArtistFanart: string | null
  strArtistFanart2: string | null
  strArtistFanart3: string | null
  strArtistFanart4: string | null
  strArtistBanner: string | null
  strMusicBrainzID: string | null
  strGenre: string | null
  strCountry: string | null
  strBiographyEN: string | null
}

interface SearchResponse {
  artists: AudioDBArtist[] | null
}

/**
 * Search for an artist by name
 */
export async function searchArtist(artistName: string): Promise<AudioDBArtist | null> {
  await rateLimiter.throttle()

  const url = `${BASE_URL}/${API_KEY}/search.php?s=${encodeURIComponent(artistName)}`

  try {
    console.log(`[TheAudioDB] Searching for artist: ${artistName}`)
    const response = await fetch(url)

    if (!response.ok) {
      console.warn(`[TheAudioDB] API error: ${response.status}`)
      return null
    }

    const data: SearchResponse = await response.json()

    if (!data.artists || data.artists.length === 0) {
      console.log(`[TheAudioDB] No artist found for: ${artistName}`)
      return null
    }

    // Return the first matching artist
    return data.artists[0] || null
  } catch (e) {
    console.error('[TheAudioDB] Search failed:', e)
    return null
  }
}

/**
 * Get artist image as base64 data URL (for canvas/Cytoscape compatibility)
 * Returns the best available image (thumb > fanart > wide thumb)
 */
export async function getArtistImage(artistName: string): Promise<string | undefined> {
  const artist = await searchArtist(artistName)

  if (!artist) {
    return undefined
  }

  // Priority: thumb > fanart > wide thumb > cutout
  // Use /preview for smaller images (faster loading)
  const imageUrl = artist.strArtistThumb ||
                   artist.strArtistFanart ||
                   artist.strArtistWideThumb ||
                   artist.strArtistCutout ||
                   artist.strArtistClearart

  if (imageUrl) {
    console.log(`[TheAudioDB] Found image for ${artistName}, converting to data URL...`)
    // Convert to data URL to bypass CORS for canvas rendering
    const dataUrl = await toDataURL(imageUrl + '/preview')
    if (dataUrl) {
      console.log(`[TheAudioDB] Image converted for ${artistName}`)
      return dataUrl
    }
    // Fallback to original URL (works in <img> but not canvas)
    return imageUrl
  }

  console.log(`[TheAudioDB] No image available for ${artistName}`)
  return undefined
}

/**
 * Get artist by MusicBrainz ID (more accurate than name search)
 */
export async function getArtistByMBID(mbid: string): Promise<AudioDBArtist | null> {
  await rateLimiter.throttle()

  const url = `${BASE_URL}/${API_KEY}/artist-mb.php?i=${mbid}`

  try {
    console.log(`[TheAudioDB] Looking up artist by MBID: ${mbid}`)
    const response = await fetch(url)

    if (!response.ok) {
      return null
    }

    const data: { artists: AudioDBArtist[] | null } = await response.json()

    if (!data.artists || data.artists.length === 0) {
      return null
    }

    return data.artists[0] || null
  } catch (e) {
    console.error('[TheAudioDB] MBID lookup failed:', e)
    return null
  }
}

/**
 * Get artist image by MusicBrainz ID (preferred) or name (fallback)
 * Returns base64 data URL for canvas/Cytoscape compatibility
 */
export async function getArtistImageWithMBID(
  artistName: string,
  mbid?: string
): Promise<string | undefined> {
  // Try MBID first if available (more accurate)
  if (mbid) {
    const artist = await getArtistByMBID(mbid)
    if (artist) {
      const imageUrl = artist.strArtistThumb ||
                       artist.strArtistFanart ||
                       artist.strArtistWideThumb

      if (imageUrl) {
        console.log(`[TheAudioDB] Found image for ${artistName} via MBID, converting...`)
        // Convert to data URL to bypass CORS for canvas rendering
        const dataUrl = await toDataURL(imageUrl + '/preview')
        if (dataUrl) {
          console.log(`[TheAudioDB] Image converted for ${artistName}`)
          return dataUrl
        }
        // Fallback to original URL
        return imageUrl
      }
    }
  }

  // Fallback to name search
  return getArtistImage(artistName)
}
