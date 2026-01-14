/**
 * Discogs API Integration
 *
 * Discogs provides excellent credits data especially for:
 * - Physical releases (vinyl, CD)
 * - Older/classic albums
 * - Session musicians and engineers
 *
 * To use:
 * 1. Create an account at https://www.discogs.com/settings/developers
 * 2. Generate a personal access token
 * 3. Set VITE_DISCOGS_TOKEN in your .env file
 *
 * Rate limits: 60 requests/minute (authenticated)
 */

import type { MusicEntity, Relationship, RoleType } from '../types/music'

// Configuration
const DISCOGS_TOKEN = import.meta.env.VITE_DISCOGS_TOKEN || ''
const BASE_URL = 'https://api.discogs.com'
const USER_AGENT = 'MusicGraph/1.0 +https://github.com/yourusername/music-graph'

/**
 * Check if Discogs API is configured
 */
export function isConfigured(): boolean {
  return DISCOGS_TOKEN.length > 0
}

// Rate limiter: Discogs allows 60 requests/minute, we'll do 1/sec to be safe
class RateLimiter {
  private lastRequestTime = 0
  private readonly minInterval = 1100 // 1.1 seconds

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

// Discogs API Types
interface DiscogsArtist {
  id: number
  name: string
  resource_url: string
  role?: string
  tracks?: string
}

interface DiscogsTrack {
  position: string
  title: string
  duration: string
  extraartists?: DiscogsArtist[]
}

interface DiscogsRelease {
  id: number
  title: string
  artists: DiscogsArtist[]
  artists_sort: string
  year?: number
  tracklist: DiscogsTrack[]
  extraartists?: DiscogsArtist[]
  genres?: string[]
  styles?: string[]
}

interface DiscogsSearchResult {
  id: number
  title: string
  type: string
  year?: string
  country?: string
  format?: string[]
  label?: string[]
  genre?: string[]
  resource_url: string
  cover_image?: string
}

interface DiscogsSearchResponse {
  pagination: {
    page: number
    pages: number
    items: number
  }
  results: DiscogsSearchResult[]
}

async function fetchDiscogs<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  await rateLimiter.throttle()

  const url = new URL(`${BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
  }

  if (DISCOGS_TOKEN) {
    headers['Authorization'] = `Discogs token=${DISCOGS_TOKEN}`
  }

  console.log(`[Discogs] Fetching: ${endpoint}`)

  const response = await fetch(url.toString(), { headers })

  if (!response.ok) {
    if (response.status === 429) {
      console.warn('[Discogs] Rate limited, waiting...')
      await new Promise(resolve => setTimeout(resolve, 60000))
      return fetchDiscogs(endpoint, params)
    }
    throw new Error(`Discogs API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Search for a release by track name, artist, and optionally album
 */
export async function searchRelease(
  trackName: string,
  artistName: string,
  albumName?: string
): Promise<DiscogsSearchResult[]> {
  if (!isConfigured()) {
    console.log('[Discogs] Not configured, skipping')
    return []
  }

  // Build search query
  let query = `${artistName} ${trackName}`
  if (albumName) {
    query = `${artistName} ${albumName}`
  }

  try {
    const data = await fetchDiscogs<DiscogsSearchResponse>('/database/search', {
      q: query,
      type: 'release',
      per_page: '10',
    })

    return data.results || []
  } catch (e) {
    console.error('[Discogs] Search failed:', e)
    return []
  }
}

/**
 * Get full release details including credits
 */
export async function getRelease(releaseId: number): Promise<DiscogsRelease | null> {
  try {
    return await fetchDiscogs<DiscogsRelease>(`/releases/${releaseId}`)
  } catch (e) {
    console.error('[Discogs] Failed to get release:', e)
    return null
  }
}

/**
 * Map Discogs role to our RoleType
 */
function mapDiscogsRole(role: string): RoleType {
  const lowerRole = role.toLowerCase()

  // Producer roles
  if (lowerRole.includes('executive producer')) return 'executive_producer'
  if (lowerRole.includes('co-producer')) return 'co_producer'
  if (lowerRole.includes('vocal producer')) return 'vocal_producer'
  if (lowerRole.includes('additional producer')) return 'additional_producer'
  if (lowerRole.includes('producer') || lowerRole.includes('produced by')) return 'producer'

  // Songwriter roles
  if (lowerRole.includes('written by') || lowerRole.includes('written-by')) return 'songwriter'
  if (lowerRole.includes('lyrics by') || lowerRole.includes('lyrics')) return 'songwriter'
  if (lowerRole.includes('music by') || lowerRole.includes('composed by')) return 'songwriter'
  if (lowerRole.includes('songwriter') || lowerRole.includes('composer')) return 'songwriter'

  // Engineer roles
  if (lowerRole.includes('mixed by') || lowerRole.includes('mixing')) return 'engineer'
  if (lowerRole.includes('mastered by') || lowerRole.includes('mastering')) return 'engineer'
  if (lowerRole.includes('recorded by') || lowerRole.includes('recording')) return 'engineer'
  if (lowerRole.includes('engineer')) return 'engineer'

  // Vocal roles
  if (lowerRole.includes('vocal') || lowerRole.includes('voice')) return 'vocals'
  if (lowerRole.includes('backing vocal') || lowerRole.includes('background vocal')) return 'vocals'
  if (lowerRole.includes('featuring') || lowerRole.includes('feat')) return 'featured'

  // Instrument roles
  if (lowerRole.includes('guitar')) return 'guitar'
  if (lowerRole.includes('bass')) return 'bass'
  if (lowerRole.includes('drum') || lowerRole.includes('percussion')) return 'drums'
  if (lowerRole.includes('keyboard') || lowerRole.includes('piano') || lowerRole.includes('synth')) return 'keyboards'

  // Default to featured for unknown roles (will still show in graph)
  return 'featured'
}

/**
 * Clean artist name (Discogs sometimes has numbering like "Artist (2)")
 */
function cleanArtistName(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim()
}

/**
 * Normalize string for comparison
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Find the best matching release for a track
 */
async function findBestRelease(
  trackName: string,
  artistName: string,
  albumName?: string
): Promise<DiscogsRelease | null> {
  const results = await searchRelease(trackName, artistName, albumName)

  if (results.length === 0) {
    return null
  }

  const normalizedArtist = normalizeForComparison(artistName)
  const normalizedAlbum = albumName ? normalizeForComparison(albumName) : null

  // Score and sort results
  const scored = results.map(r => {
    let score = 0
    const titleLower = r.title.toLowerCase()

    // Artist match in title
    if (titleLower.includes(normalizedArtist)) {
      score += 50
    }

    // Album match
    if (normalizedAlbum && normalizeForComparison(r.title).includes(normalizedAlbum)) {
      score += 100
    }

    // Prefer releases over compilations
    if (r.format?.some(f => f.toLowerCase().includes('compilation'))) {
      score -= 50
    }

    // Prefer albums over singles
    if (r.format?.some(f => f.toLowerCase().includes('album') || f.toLowerCase() === 'lp')) {
      score += 20
    }

    // Penalize anniversary/deluxe/remaster editions - prefer original releases
    const titleForEditionCheck = r.title.toLowerCase()
    if (/\b(25|30|40|50)\b/.test(titleForEditionCheck)) {
      score -= 40 // Anniversary editions like "Bad 25"
    }
    if (/\b(deluxe|special|limited|expanded|remaster|anniversary|collector|box\s*set)\b/i.test(titleForEditionCheck)) {
      score -= 30
    }

    return { result: r, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // Log top matches for debugging
  console.log('[Discogs] Top release matches:')
  scored.slice(0, 5).forEach((s, i) => {
    console.log(`  ${i + 1}. "${s.result.title}" (score: ${s.score})`)
  })

  // Get full release details for best match
  const bestMatch = scored[0]
  if (bestMatch) {
    console.log(`[Discogs] Selected: "${bestMatch.result.title}" (score: ${bestMatch.score})`)
    return getRelease(bestMatch.result.id)
  }

  return null
}

export interface DiscogsCredits {
  entities: MusicEntity[]
  relationships: Relationship[]
}

/**
 * Get credits for a track from Discogs
 * Returns entities and relationships to merge with existing graph
 */
export async function getTrackCredits(
  trackName: string,
  artistName: string,
  albumName?: string,
  existingTrackId?: string
): Promise<DiscogsCredits> {
  if (!isConfigured()) {
    return { entities: [], relationships: [] }
  }

  console.log(`[Discogs] Getting credits for: ${trackName} by ${artistName}`)

  const release = await findBestRelease(trackName, artistName, albumName)
  if (!release) {
    console.log('[Discogs] No matching release found')
    return { entities: [], relationships: [] }
  }

  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const seenArtists = new Set<string>()

  const trackId = existingTrackId || `track-discogs-${release.id}`
  const normalizedTrackName = normalizeForComparison(trackName)

  // Find the specific track in the tracklist
  const matchingTrack = release.tracklist.find(t =>
    normalizeForComparison(t.title).includes(normalizedTrackName) ||
    normalizedTrackName.includes(normalizeForComparison(t.title))
  )

  // Process track-level credits if we found the track
  if (matchingTrack?.extraartists) {
    console.log(`[Discogs] Found track "${matchingTrack.title}" with ${matchingTrack.extraartists.length} credits`)

    for (const artist of matchingTrack.extraartists) {
      const artistId = `artist-discogs-${artist.id}`
      const cleanName = cleanArtistName(artist.name)

      if (!seenArtists.has(artistId)) {
        entities.push({
          id: artistId,
          name: cleanName,
          type: 'artist',
          isExpanded: false,
          isHidden: false,
          childrenLoaded: false,
        })
        seenArtists.add(artistId)
      }

      const role = mapDiscogsRole(artist.role || 'performer')
      relationships.push({
        id: `rel-discogs-${trackId}-${artistId}-${role}`,
        source: trackId,
        target: artistId,
        role,
      })
    }
  }

  // Also process release-level credits (often has producers, engineers)
  if (release.extraartists) {
    console.log(`[Discogs] Processing ${release.extraartists.length} release-level credits`)

    for (const artist of release.extraartists) {
      const artistId = `artist-discogs-${artist.id}`
      const cleanName = cleanArtistName(artist.name)

      // Skip if this credit is for specific tracks that don't match ours
      if (artist.tracks && matchingTrack) {
        const trackPositions = artist.tracks.split(',').map(t => t.trim())
        if (!trackPositions.includes(matchingTrack.position) && !trackPositions.includes('')) {
          continue
        }
      }

      if (!seenArtists.has(artistId)) {
        entities.push({
          id: artistId,
          name: cleanName,
          type: 'artist',
          isExpanded: false,
          isHidden: false,
          childrenLoaded: false,
        })
        seenArtists.add(artistId)
      }

      const role = mapDiscogsRole(artist.role || 'performer')
      relationships.push({
        id: `rel-discogs-${trackId}-${artistId}-${role}`,
        source: trackId,
        target: artistId,
        role,
      })
    }
  }

  console.log(`[Discogs] Found ${entities.length} credits`)
  return { entities, relationships }
}
