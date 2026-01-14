import type { MusicGraph, MusicEntity, Relationship, ReleaseType } from '../types/music'
import {
  getCachedTrack,
  setCachedTrack,
  cleanupExpiredEntries,
  clearCache as clearTrackCache,
  getCacheStats
} from './trackCache'
import { getAlbumImage as getLastFmAlbumImage, getArtistImage as getLastFmArtistImage } from './lastfm'
import {
  getTrackCredits as getDiscogsCredits,
  isConfigured as isDiscogsConfigured,
  getArtistImage as getDiscogsArtistImage
} from './discogs'
import { getArtistImageWithMBID as getAudioDBArtistImage } from './theaudiodb'

/**
 * Global image cache - stores images by normalized name
 * This avoids redundant API calls when the same artist/album appears multiple times
 *
 * Values:
 * - string: cached base64 data URL
 * - null: we tried but no image was found (avoid re-fetching)
 * - undefined (not in map): never tried
 */
const artistImageCache = new Map<string, string | null>()
const albumImageCache = new Map<string, string | null>()

/**
 * Normalize name for cache key (lowercase, remove punctuation)
 */
function normalizeForCache(name: string): string {
  return name.toLowerCase().replace(/[^\w\s]/g, '').trim()
}

/**
 * Get artist image with caching and fallback chain: TheAudioDB -> Discogs -> Last.fm
 *
 * The cache is checked first to avoid redundant API calls.
 * Images are stored as base64 data URLs for canvas/Cytoscape compatibility.
 */
async function getArtistImage(artistName: string, mbid?: string): Promise<string | undefined> {
  const cacheKey = normalizeForCache(artistName)

  // Check cache first
  if (artistImageCache.has(cacheKey)) {
    const cached = artistImageCache.get(cacheKey)
    if (cached) {
      console.log(`[Image] Cache hit for artist: ${artistName}`)
      return cached
    }
    // cached === null means we tried before and found nothing
    console.log(`[Image] Cache hit (no image) for artist: ${artistName}`)
    return undefined
  }

  console.log(`[Image] Cache miss for artist: ${artistName}, fetching...`)

  // Try TheAudioDB first (has artist images, uses CORS proxy for canvas compatibility)
  const audioDbImage = await getAudioDBArtistImage(artistName, mbid)
  if (audioDbImage) {
    console.log(`[Image] Found TheAudioDB image for ${artistName}`)
    artistImageCache.set(cacheKey, audioDbImage)
    return audioDbImage
  }

  // Try Discogs (has good artist images)
  if (isDiscogsConfigured()) {
    const discogsImage = await getDiscogsArtistImage(artistName)
    if (discogsImage) {
      console.log(`[Image] Found Discogs image for ${artistName}`)
      artistImageCache.set(cacheKey, discogsImage)
      return discogsImage
    }
  }

  // Fallback to Last.fm (deprecated but might still work for some artists)
  const lastFmImage = await getLastFmArtistImage(artistName)
  if (lastFmImage) {
    console.log(`[Image] Found Last.fm image for ${artistName}`)
    artistImageCache.set(cacheKey, lastFmImage)
    return lastFmImage
  }

  // Mark as "no image found" to avoid re-fetching
  artistImageCache.set(cacheKey, null)
  console.log(`[Image] No image found for ${artistName}, cached as null`)
  return undefined
}

/**
 * Get album image with caching
 * Uses Last.fm which still has good album artwork
 */
async function getAlbumImage(artistName: string, albumName: string): Promise<string | undefined> {
  const cacheKey = `${normalizeForCache(artistName)}::${normalizeForCache(albumName)}`

  // Check cache first
  if (albumImageCache.has(cacheKey)) {
    const cached = albumImageCache.get(cacheKey)
    if (cached) {
      console.log(`[Image] Cache hit for album: ${albumName}`)
      return cached
    }
    console.log(`[Image] Cache hit (no image) for album: ${albumName}`)
    return undefined
  }

  console.log(`[Image] Cache miss for album: ${albumName}, fetching...`)

  const image = await getLastFmAlbumImage(artistName, albumName)
  if (image) {
    albumImageCache.set(cacheKey, image)
    return image
  }

  // Mark as "no image found"
  albumImageCache.set(cacheKey, null)
  return undefined
}

/**
 * Clear the image cache (useful for debugging or forced refresh)
 */
export function clearImageCache(): void {
  artistImageCache.clear()
  albumImageCache.clear()
  console.log('[Image] Cache cleared')
}

/**
 * Get image cache statistics
 */
export function getImageCacheStats(): { artists: number; albums: number; hits: number } {
  return {
    artists: artistImageCache.size,
    albums: albumImageCache.size,
    hits: [...artistImageCache.values(), ...albumImageCache.values()].filter(v => v !== null).length
  }
}

// Re-export cache utilities for external use
export { clearTrackCache, getCacheStats }

const BASE_URL = 'https://musicbrainz.org/ws/2'
const USER_AGENT = 'SongLines/1.0 (https://github.com/yourusername/songlines)'

// Clean up expired cache entries on module load
cleanupExpiredEntries()

/**
 * Artist Alias Resolution System
 *
 * Many artists have multiple names:
 * - Stage name vs legal name: "The Weeknd" vs "Abel Tesfaye"
 * - Variations: "Jay-Z" vs "JAY-Z" vs "Shawn Carter"
 *
 * This system maps all known aliases to a canonical artist MBID,
 * enabling proper deduplication across different credit types.
 */

// Maps normalized alias name -> canonical MBID
const aliasToMbidMap = new Map<string, string>()
// Maps MBID -> canonical display name (for consistent naming)
const mbidToCanonicalName = new Map<string, string>()
// Set of MBIDs we've already fetched aliases for
const fetchedAliases = new Set<string>()

/**
 * Fetch and cache all aliases for an artist from MusicBrainz
 */
async function fetchArtistAliases(mbid: string, primaryName: string): Promise<void> {
  if (fetchedAliases.has(mbid)) {
    return // Already fetched
  }

  fetchedAliases.add(mbid)

  // Store the primary name mapping
  const normalizedPrimary = normalizeForCache(primaryName)
  aliasToMbidMap.set(normalizedPrimary, mbid)
  mbidToCanonicalName.set(mbid, primaryName)

  try {
    // Fetch artist with aliases
    const data = await fetchMB<{
      id: string
      name: string
      aliases?: Array<{
        name: string
        'sort-name': string
        type?: string
        locale?: string
      }>
    }>(`/artist/${mbid}`, { inc: 'aliases' })

    if (data.aliases && data.aliases.length > 0) {
      console.log(`[Alias] Found ${data.aliases.length} aliases for "${primaryName}":`)
      for (const alias of data.aliases) {
        const normalizedAlias = normalizeForCache(alias.name)
        if (!aliasToMbidMap.has(normalizedAlias)) {
          aliasToMbidMap.set(normalizedAlias, mbid)
          console.log(`  - "${alias.name}" → ${mbid}`)
        }
      }
    }
  } catch (e) {
    console.warn(`[Alias] Failed to fetch aliases for ${primaryName}:`, e)
  }
}

/**
 * Resolve an artist name to a canonical MBID (if known)
 * Returns undefined if the name isn't a known alias
 */
function resolveArtistAlias(name: string): string | undefined {
  const normalized = normalizeForCache(name)
  return aliasToMbidMap.get(normalized)
}

/**
 * Get the canonical display name for an MBID
 */
function getCanonicalName(mbid: string): string | undefined {
  return mbidToCanonicalName.get(mbid)
}

/**
 * Clear alias cache (useful for debugging)
 */
export function clearAliasCache(): void {
  aliasToMbidMap.clear()
  mbidToCanonicalName.clear()
  fetchedAliases.clear()
  console.log('[Alias] Cache cleared')
}

// Rate limiter: MusicBrainz requires max 1 request per second
class RateLimiter {
  private lastRequestTime = 0
  private readonly minInterval = 1100 // 1.1 seconds to be safe

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

interface MBArtist {
  id: string
  name: string
  'sort-name': string
  type?: string
  country?: string
  'life-span'?: {
    begin?: string
    end?: string
    ended?: boolean
  }
}

interface MBRecording {
  id: string
  title: string
  length?: number
  'artist-credit'?: Array<{
    artist: MBArtist
    joinphrase?: string
  }>
}

interface MBRelease {
  id: string
  title: string
  date?: string
  'release-group'?: {
    id: string
    title: string
    'primary-type'?: string
  }
}

interface MBWork {
  id: string
  title: string
  type?: string
  relations?: MBRelation[]
}

interface MBRelation {
  type: string
  'type-id': string
  direction: 'forward' | 'backward'
  artist?: MBArtist
  recording?: MBRecording
  release?: MBRelease
  work?: MBWork
  attributes?: string[]
}

interface MBReleaseGroup {
  id: string
  title: string
  'primary-type'?: string
  'secondary-types'?: string[]
  'first-release-date'?: string
}

interface MBMedium {
  position: number
  format?: string
  tracks: MBTrack[]
}

interface MBTrack {
  id: string
  number: string
  title: string
  length?: number
  recording: MBRecording
}

// Result type for drill-down operations
export interface DrillDownResult {
  entities: MusicEntity[]
  relationships: Relationship[]
}

async function fetchMB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  // Apply rate limiting
  await rateLimiter.throttle()

  const url = new URL(`${BASE_URL}${endpoint}`)
  url.searchParams.set('fmt', 'json')
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))

  console.log(`[MusicBrainz] Fetching: ${endpoint}`)

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`)
  }

  return response.json()
}

export async function searchArtist(query: string): Promise<MBArtist[]> {
  const data = await fetchMB<{ artists: MBArtist[] }>('/artist', { query })
  return data.artists || []
}

/**
 * Search for releases by album name and artist
 */
async function searchRelease(albumName: string, artistName: string): Promise<Array<{
  id: string
  title: string
  status?: string
  date?: string
  score?: number
  'release-group'?: { 'primary-type'?: string; 'secondary-types'?: string[] }
}>> {
  const query = `release:"${albumName}" AND artist:"${artistName}"`
  const data = await fetchMB<{ releases: Array<{
    id: string
    title: string
    status?: string
    date?: string
    score?: number
    'release-group'?: { 'primary-type'?: string; 'secondary-types'?: string[] }
  }> }>('/release', { query, limit: '25' })
  return data.releases || []
}

/**
 * Find a recording by looking up the release first, then finding the track
 * This is more accurate than searching for recordings directly when we know the album
 */
async function findRecordingViaRelease(
  trackName: string,
  artistName: string,
  albumName: string
): Promise<{ recordingId: string; releaseId: string; title: string } | null> {
  console.log(`[MusicBrainz] Trying release-based lookup for "${trackName}" on "${albumName}"`)

  // Search for the release
  const releases = await searchRelease(albumName, artistName)
  if (releases.length === 0) {
    console.log('[MusicBrainz] No releases found for album')
    return null
  }

  // Score releases - prefer original albums, penalize compilations/deluxe/etc
  const scoredReleases = releases.map(r => {
    let score = r.score || 0
    const titleLower = r.title.toLowerCase()

    // Exact album name match
    if (normalizeForComparison(r.title) === normalizeForComparison(albumName)) {
      score += 100
    }

    // Prefer official releases
    if (r.status === 'Official') {
      score += 20
    }

    // Penalize compilations, live albums, etc
    const secondaryTypes = r['release-group']?.['secondary-types'] || []
    if (secondaryTypes.some(t => ['Compilation', 'Live', 'Remix', 'DJ-mix'].includes(t))) {
      score -= 100
    }

    // Penalize anniversary/deluxe editions
    if (/\b(25|30|40|50|deluxe|special|anniversary|remaster|expanded)\b/i.test(titleLower)) {
      score -= 50
    }

    // Prefer Albums
    if (r['release-group']?.['primary-type'] === 'Album') {
      score += 30
    }

    return { release: r, score }
  })

  scoredReleases.sort((a, b) => b.score - a.score)

  console.log('[MusicBrainz] Top release matches:')
  scoredReleases.slice(0, 3).forEach((sr, i) => {
    console.log(`  ${i + 1}. "${sr.release.title}" (score: ${sr.score}, id: ${sr.release.id})`)
  })

  // Try top releases to find the track
  const normalizedTrack = normalizeForComparison(trackName)

  for (const { release } of scoredReleases.slice(0, 3)) {
    try {
      // Get tracks from this release
      const releaseData = await fetchMB<{
        media?: Array<{
          tracks?: Array<{
            recording: { id: string; title: string }
          }>
        }>
      }>(`/release/${release.id}`, { inc: 'recordings' })

      // Find matching track
      for (const medium of releaseData.media || []) {
        for (const track of medium.tracks || []) {
          if (normalizeForComparison(track.recording.title) === normalizedTrack) {
            console.log(`[MusicBrainz] Found recording via release: ${track.recording.id}`)
            return {
              recordingId: track.recording.id,
              releaseId: release.id,
              title: track.recording.title
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[MusicBrainz] Failed to get tracks from release ${release.id}:`, e)
    }
  }

  console.log('[MusicBrainz] Track not found on any matching release')
  return null
}

interface MBRecordingSearchResult {
  id: string
  title: string
  length?: number
  score?: number
  disambiguation?: string
  'artist-credit': Array<{
    artist: MBArtist
    joinphrase?: string
  }>
  releases?: Array<{
    id: string
    title: string
    status?: string
    'release-group'?: {
      id: string
      'primary-type'?: string
      'secondary-types'?: string[]
    }
  }>
}

/**
 * Clean track name by removing featured artist patterns and version suffixes
 * Last.fm: "If They Knew (Feat. K. Michelle)"
 * MusicBrainz: "If They Knew" (with K. Michelle as artist credit)
 *
 * Also handles:
 * - "Warm (LP Version)" -> "Warm"
 * - "Track Name From Album Name" -> "Track Name"
 */
function cleanTrackName(trackName: string): string {
  // Patterns to remove (case-insensitive)
  const featPatterns = [
    /\s*[\(\[]\s*(?:feat\.?|ft\.?|featuring)\s+[^\)\]]+[\)\]]/gi,  // (feat. X) or [feat. X]
    /\s*[-–—]\s*(?:feat\.?|ft\.?|featuring)\s+.+$/gi,              // - feat. X at end
    /\s*(?:feat\.?|ft\.?|featuring)\s+.+$/gi,                       // feat. X at end (no separator)
  ]

  let cleaned = trackName
  for (const pattern of featPatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Clean up version suffixes that MusicBrainz might not have
  const versionPatterns = [
    /\s*[\(\[](?:official\s*(?:video|audio|music\s*video)?|lyric\s*video|audio|explicit|clean)[\)\]]/gi,
    /\s*[\(\[](?:radio\s*edit|single\s*version|album\s*version|lp\s*version|12"\s*version|7"\s*version)[\)\]]/gi,
    /\s*[\(\[](?:extended|original|edit|mix|remix|remaster(?:ed)?|bonus\s*track)[\)\]]/gi,
    /\s*[\(\[](?:live|acoustic|demo|instrumental)[\)\]]/gi,
  ]

  for (const pattern of versionPatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove "From [Album Name]" suffix (common in Last.fm scrobbles)
  // e.g., "Warm (LP Version) From Change Of Heart" -> "Warm"
  cleaned = cleaned.replace(/\s+from\s+.+$/i, '')

  return cleaned.trim()
}

/**
 * Search for a recording (track) by name, artist, and optionally album
 */
export async function searchRecording(
  trackName: string,
  artistName?: string,
  albumName?: string
): Promise<MBRecordingSearchResult[]> {
  // Clean the track name to remove featured artists and other suffixes
  const cleanedTrackName = cleanTrackName(trackName)

  // Log if we cleaned the name
  if (cleanedTrackName !== trackName) {
    console.log(`[MusicBrainz] Cleaned track name: "${trackName}" → "${cleanedTrackName}"`)
  }

  let query = `recording:"${cleanedTrackName}"`
  if (artistName) {
    query += ` AND artist:"${artistName}"`
  }
  if (albumName) {
    query += ` AND release:"${albumName}"`
  }

  const data = await fetchMB<{ recordings: MBRecordingSearchResult[] }>('/recording', {
    query,
    limit: '25',
  })

  // If no results with cleaned name, try original name as fallback
  if (data.recordings?.length === 0 && cleanedTrackName !== trackName) {
    console.log(`[MusicBrainz] No results with cleaned name, trying original...`)
    let fallbackQuery = `recording:"${trackName}"`
    if (artistName) {
      fallbackQuery += ` AND artist:"${artistName}"`
    }
    if (albumName) {
      fallbackQuery += ` AND release:"${albumName}"`
    }

    const fallbackData = await fetchMB<{ recordings: MBRecordingSearchResult[] }>('/recording', {
      query: fallbackQuery,
      limit: '25',
    })
    return fallbackData.recordings || []
  }

  return data.recordings || []
}

/**
 * Check if a recording title looks like a live/remix/alternate version
 */
function isAlternateVersion(title: string, disambiguation?: string): boolean {
  const lowerDisamb = (disambiguation || '').toLowerCase()

  const alternateIndicators = [
    'live', 'remix', 'acoustic', 'demo', 'radio edit', 'instrumental',
    'karaoke', 'cover', 'remaster', 'alternate', 'edit', 'mix',
    'version', 'reprise', 'interlude', 'skit'
  ]

  // Check disambiguation field (more reliable indicator)
  for (const indicator of alternateIndicators) {
    if (lowerDisamb.includes(indicator)) return true
  }

  // Check title for common patterns like "(Live)" or "[Remix]"
  const bracketPattern = /[\(\[\-].*?(live|remix|acoustic|demo|radio|instrumental|remaster|edit|mix).*?[\)\]]/i
  if (bracketPattern.test(title)) return true

  return false
}

interface MBRecordingRelease {
  id: string
  title: string
  status?: string
  'release-group'?: {
    id: string
    'primary-type'?: string
    'secondary-types'?: string[]
  }
}

/**
 * Check if a release is from a compilation, live album, remix album, or soundtrack
 */
function isAlternateRelease(release: MBRecordingRelease): boolean {
  const secondaryTypes = release['release-group']?.['secondary-types'] || []
  const alternateTypes = ['Live', 'Remix', 'Compilation', 'DJ-mix', 'Mixtape/Street', 'Soundtrack']

  if (secondaryTypes.some((t: string) => alternateTypes.includes(t))) {
    return true
  }

  // Also check the title for common compilation/soundtrack indicators
  const title = release.title.toLowerCase()
  const compilationIndicators = [
    'greatest hits', 'best of', 'collection', 'anthology',
    'soundtrack', 'ost', 'motion picture', 'film', 'movie',
    'various artists', 'compilation', 'now that\'s what i call',
    'hits', 'essentials', 'ultimate', 'complete', 'definitive'
  ]

  return compilationIndicators.some(indicator => title.includes(indicator))
}

/**
 * Check if a release title looks like it could be a soundtrack
 */
function isSoundtrackRelease(title: string): boolean {
  const lower = title.toLowerCase()
  return lower.includes('soundtrack') ||
         lower.includes('ost') ||
         lower.includes('motion picture') ||
         lower.includes('film') ||
         lower.includes('movie') ||
         lower.includes('music from') ||
         lower.includes('inspired by')
}

/**
 * Normalize a string for comparison (lowercase, remove punctuation, trim)
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim()
}

/**
 * Normalize artist name for deduplication
 * Handles variations like "J.I.D." vs "JID", "A$AP Rocky" vs "ASAP Rocky"
 */
function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.\-_$]/g, '') // Remove periods, hyphens, underscores, dollar signs
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim()
}

/**
 * Score how well a recording matches our search criteria
 */
function scoreRecordingMatch(
  recording: MBRecordingSearchResult,
  trackName: string,
  artistName: string,
  albumName?: string
): number {
  let score = recording.score || 0

  const normalizedTrack = normalizeForComparison(trackName)
  const normalizedRecordingTitle = normalizeForComparison(recording.title)
  const normalizedArtist = normalizeForComparison(artistName)

  // Exact track title match is a big bonus
  if (normalizedRecordingTitle === normalizedTrack) {
    score += 50
  }

  // Penalize alternate versions heavily
  if (isAlternateVersion(recording.title, recording.disambiguation)) {
    score -= 100
  }

  // Penalize "clean" versions - prefer explicit/original versions which have more complete data
  const disamb = (recording.disambiguation || '').toLowerCase()
  if (disamb.includes('clean') || disamb.includes('edited') || disamb.includes('radio edit')) {
    score -= 50
  }

  // Bonus for recordings with multiple artist credits (suggests more complete data)
  // This helps pick collaborative versions over solo versions of the same track
  const artistCreditCount = (recording['artist-credit'] || []).length
  if (artistCreditCount > 1) {
    score += 25 * (artistCreditCount - 1) // +25 per additional artist
  }

  // Check artist match
  const recordingArtists = (recording['artist-credit'] || [])
    .map(c => normalizeForComparison(c.artist.name))
  if (recordingArtists.some(a => a === normalizedArtist || a.includes(normalizedArtist))) {
    score += 30
  }

  // Check album match if provided
  if (albumName) {
    const normalizedAlbum = normalizeForComparison(albumName)
    const releases = recording.releases || []

    let bestReleaseScore = -50 // Penalty if no matching release

    for (const release of releases) {
      const normalizedReleaseTitle = normalizeForComparison(release.title)
      let releaseScore = 0

      // Exact album match
      if (normalizedReleaseTitle === normalizedAlbum) {
        releaseScore += 80
      } else if (normalizedReleaseTitle.includes(normalizedAlbum) || normalizedAlbum.includes(normalizedReleaseTitle)) {
        releaseScore += 40
      }

      // Bonus for official releases
      if (release.status === 'Official') {
        releaseScore += 10
      }

      // Penalize compilations, live albums, etc.
      if (isAlternateRelease(release)) {
        releaseScore -= 60
      }

      // Prefer Albums over Singles/EPs for matching
      const primaryType = release['release-group']?.['primary-type']
      if (primaryType === 'Album') {
        releaseScore += 15
      }

      bestReleaseScore = Math.max(bestReleaseScore, releaseScore)
    }

    score += bestReleaseScore
  }

  return score
}

/**
 * Build a flat graph centered on a track (for Now Playing)
 * Returns: Track node connected to Artist(s), Album, and Personnel
 * Uses caching to reduce API calls for frequently played tracks.
 */
export async function buildGraphFromTrack(
  trackName: string,
  artistName: string,
  albumName?: string
): Promise<DrillDownResult> {
  console.log('[MusicBrainz] Building flat graph for track:', trackName, 'by', artistName, 'from album:', albumName)

  // Check cache first
  const cached = getCachedTrack(trackName, artistName, albumName)
  if (cached) {
    return cached
  }

  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  let recordingMbid: string
  let recordingTitle: string
  let releaseIdFromLookup: string | undefined

  // STRATEGY 1: If we have an album name, try finding the recording via the release
  // This is more accurate because it finds the exact recording from that specific release
  if (albumName) {
    const releaseResult = await findRecordingViaRelease(trackName, artistName, albumName)
    if (releaseResult) {
      recordingMbid = releaseResult.recordingId
      recordingTitle = releaseResult.title
      releaseIdFromLookup = releaseResult.releaseId
      console.log(`[MusicBrainz] Using recording from release lookup: ${recordingMbid}`)
    }
  }

  // STRATEGY 2: Fall back to recording search if release lookup didn't work
  if (!recordingMbid!) {
    // Search for the recording - include album in search if provided
    let recordings = await searchRecording(trackName, artistName, albumName)

    // If no results with album, try without it
    if (recordings.length === 0 && albumName) {
      console.log('[MusicBrainz] No results with album filter, trying without...')
      recordings = await searchRecording(trackName, artistName)
    }

    if (recordings.length === 0) {
      console.log('[MusicBrainz] No recordings found, falling back to artist search')
      return { entities: [], relationships: [] }
    }

    // Score all recordings and pick the best match
    const scoredRecordings = recordings.map(r => ({
      recording: r,
      score: scoreRecordingMatch(r, trackName, artistName, albumName)
    }))

    // Sort by score descending
    scoredRecordings.sort((a, b) => b.score - a.score)

    // Log top matches for debugging
    console.log('[MusicBrainz] Top recording matches:')
    scoredRecordings.slice(0, 5).forEach((sr, i) => {
      const artists = sr.recording['artist-credit']?.map(c => c.artist.name).join(', ') || 'unknown'
      const releases = sr.recording.releases?.map(r => {
        const type = r['release-group']?.['primary-type'] || ''
        return `${r.title}${type ? ` [${type}]` : ''}`
      }).join(', ') || 'no releases'
      const disambig = sr.recording.disambiguation ? ` (${sr.recording.disambiguation})` : ''
      console.log(`  ${i + 1}. "${sr.recording.title}"${disambig} by ${artists}`)
      console.log(`      Score: ${sr.score}, MBID: ${sr.recording.id}`)
      console.log(`      Releases: ${releases}`)
    })

    const bestRecording = scoredRecordings[0]!.recording
    recordingMbid = bestRecording.id
    recordingTitle = bestRecording.title

    console.log(`[MusicBrainz] Selected recording: "${bestRecording.title}" (${recordingMbid})`)
  }

  // Fetch FULL recording details to get complete artist credits AND releases
  // Search results may have incomplete/abbreviated data
  console.log(`[MusicBrainz] View on MusicBrainz: https://musicbrainz.org/recording/${recordingMbid}`)
  const fullRecording = await fetchMB<{
    id: string
    title: string
    'artist-credit'?: Array<{ artist: MBArtist; joinphrase?: string }>
    relations?: MBRelation[]
    releases?: Array<{
      id: string
      title: string
      status?: string
      date?: string
      'release-group'?: {
        id: string
        'primary-type'?: string
        'secondary-types'?: string[]
      }
    }>
  }>(`/recording/${recordingMbid}`, {
    inc: 'artist-credits+artist-rels+work-rels+releases+release-groups',
  })

  // Create track entity
  const trackId = `track-${recordingMbid}`
  entities.push({
    id: trackId,
    mbid: recordingMbid,
    name: fullRecording.title,
    type: 'track',
    isExpanded: false,
    isHidden: false,
    childrenLoaded: true, // We're loading everything
  })
  entityIds.add(trackId)

  // Track primary artists vs featured artists from artist-credit
  // Primary artists should connect to the album, featured artists only to the track
  const primaryArtistIds = new Set<string>()  // For personnel distinction
  const albumArtistIds = new Set<string>()    // Only searched artist connects to album
  const normalizedArtistNames = new Set<string>() // For deduplicating artists with name variations (J.I.D. vs JID)

  // Add artists from FULL recording's artist-credit (not search result)
  // MusicBrainz uses joinphrase to indicate featured artists:
  // e.g., [{ artist: "Rick Ross", joinphrase: " feat. " }, { artist: "K. Michelle" }]
  // The joinphrase BEFORE an artist indicates they are featured
  const artistCredits = fullRecording['artist-credit'] || []
  console.log(`[MusicBrainz] Found ${artistCredits.length} artist credits:`, artistCredits.map(c => c.artist.name).join(', '))
  let nextIsFeatured = false

  // Normalize the searched artist name for comparison
  const normalizedSearchArtist = normalizeForComparison(artistName)

  for (let i = 0; i < artistCredits.length; i++) {
    const credit = artistCredits[i]!
    const artistId = `artist-${credit.artist.id}`
    primaryArtistIds.add(artistId)

    // Determine if this artist is featured based on the PREVIOUS joinphrase
    const isFeatured = nextIsFeatured

    // Check if the joinphrase indicates the NEXT artist is featured
    // Note: "&", "and", "/" are NOT featured indicators - they indicate co-primary artists
    const joinphrase = (credit.joinphrase || '').toLowerCase()
    nextIsFeatured = joinphrase.includes('feat') ||
                     joinphrase.includes('ft.') ||
                     joinphrase.includes('featuring') ||
                     (joinphrase.includes('with ') && !joinphrase.includes('&'))

    // Only connect to album if:
    // 1. Not a featured artist (no "feat" prefix), AND
    // 2. Matches the searched artist name (handles guest artists on solo albums)
    // This ensures "Reflections Laughing" by The Weeknd, Travis Scott & Florence + the Machine
    // only connects The Weeknd to the album "Hurry Up Tomorrow", not Travis Scott or Florence
    const normalizedCreditArtist = normalizeForComparison(credit.artist.name)
    const matchesSearchedArtist = normalizedCreditArtist === normalizedSearchArtist ||
                                   normalizedCreditArtist.includes(normalizedSearchArtist) ||
                                   normalizedSearchArtist.includes(normalizedCreditArtist)

    const normalizedName = normalizeArtistName(credit.artist.name)
    let effectiveArtistId = artistId // The ID to use for relationships

    // Check both by ID and normalized name to catch duplicates like "J.I.D." vs "JID"
    if (!entityIds.has(artistId) && !normalizedArtistNames.has(normalizedName)) {
      entities.push({
        id: artistId,
        mbid: credit.artist.id,
        name: credit.artist.name,
        type: 'artist',
        isExpanded: false,
        isHidden: false,
        childrenLoaded: false,
      })
      entityIds.add(artistId)
      normalizedArtistNames.add(normalizedName)
    } else if (normalizedArtistNames.has(normalizedName) && !entityIds.has(artistId)) {
      // Artist exists with different ID but same normalized name - use existing ID for relationships
      const existingArtist = entities.find(e => normalizeArtistName(e.name) === normalizedName && e.type === 'artist')
      if (existingArtist) {
        effectiveArtistId = existingArtist.id
        console.log(`[MusicBrainz] Deduped artist: "${credit.artist.name}" → "${existingArtist.name}"`)
      }
    }

    // Update tracking sets with effective ID
    primaryArtistIds.add(effectiveArtistId)
    if (!isFeatured && matchesSearchedArtist) {
      albumArtistIds.add(effectiveArtistId)
    }

    // Track -> Artist relationship with appropriate role
    const role = isFeatured ? 'featured' : 'primary_artist'
    const relId = `rel-${trackId}-${effectiveArtistId}-${role}`
    if (!relationships.some(r => r.id === relId)) {
      relationships.push({
        id: relId,
        source: trackId,
        target: effectiveArtistId,
        role,
      })
    }
  }

  // Fetch aliases for primary artists (needed for deduping songwriter credits like "Abel Tesfaye" → "The Weeknd")
  // Do this before processing work relations
  console.log('[MusicBrainz] Fetching aliases for primary artists...')
  const aliasPromises = artistCredits.map(credit =>
    fetchArtistAliases(credit.artist.id, credit.artist.name).catch(() => {})
  )
  await Promise.all(aliasPromises)

  // Add album from releases (pick best match using scoring)
  // Use full recording's releases (more complete than search results)
  // Also track if this track was released as a single (for artwork)
  const releases = fullRecording.releases || bestRecording.releases || []
  let targetRelease: typeof bestRecording.releases[0] | undefined = undefined
  let singleRelease: { id: string; title: string; status?: string; date?: string; 'release-group'?: { id: string; 'primary-type'?: string; 'secondary-types'?: string[] } } | undefined = undefined

  if (releases.length > 0) {
    // Debug: log all releases and their types
    console.log(`[MusicBrainz] Recording has ${releases.length} releases:`)
    for (const r of releases.slice(0, 10)) { // Limit to first 10 for readability
      const type = r['release-group']?.['primary-type'] || 'unknown'
      console.log(`  - "${r.title}" [${type}]`)
    }
    if (releases.length > 10) {
      console.log(`  ... and ${releases.length - 10} more`)
    }

    // First, find if there's a single release for this track
    const singleReleases = releases.filter(r =>
      r['release-group']?.['primary-type'] === 'Single' &&
      !isAlternateRelease(r as MBRecordingRelease)
    )
    if (singleReleases.length > 0) {
      // Pick the earliest single (original release) - sort by date
      singleReleases.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
      singleRelease = singleReleases[0]
      console.log(`[MusicBrainz] Track has single release: "${singleRelease!.title}"`)
    } else {
      console.log(`[MusicBrainz] No single release found for this track`)
    }
    const normalizedAlbum = albumName ? normalizeForComparison(albumName) : null

    // Score each release
    const scoredReleases = releases.map(release => {
      let score = 0
      const normalizedReleaseTitle = normalizeForComparison(release.title)
      const primaryType = release['release-group']?.['primary-type']

      // Album name matching (most important when album is provided)
      if (normalizedAlbum) {
        if (normalizedReleaseTitle === normalizedAlbum) {
          score += 200 // Exact match - very strong signal
        } else if (normalizedReleaseTitle.includes(normalizedAlbum) || normalizedAlbum.includes(normalizedReleaseTitle)) {
          score += 80 // Partial match
        } else {
          // Album name provided but doesn't match - penalize heavily
          score -= 100
        }
      }

      // Bonus for official releases
      if (release.status === 'Official') {
        score += 15
      }

      // Penalize compilations, soundtracks, live albums heavily
      if (isAlternateRelease(release)) {
        score -= 150
      }

      // Extra penalty for soundtracks specifically
      if (isSoundtrackRelease(release.title)) {
        score -= 100
      }

      // Prefer original Albums over Singles/EPs
      if (primaryType === 'Album') {
        score += 30
      } else if (primaryType === 'Single') {
        score += 5
      } else if (primaryType === 'EP') {
        score += 10
      }

      return { release, score }
    })

    // Sort by score and pick best
    scoredReleases.sort((a, b) => b.score - a.score)
    targetRelease = scoredReleases[0]?.release

    // Log top 3 releases for debugging
    console.log('[MusicBrainz] Release scoring (top 3):')
    scoredReleases.slice(0, 3).forEach((sr, i) => {
      const type = sr.release['release-group']?.['primary-type'] || 'Unknown'
      const secondary = sr.release['release-group']?.['secondary-types']?.join(', ') || ''
      console.log(`  ${i + 1}. "${sr.release.title}" [${type}${secondary ? '/' + secondary : ''}] (score: ${sr.score})`)
    })
  }

  if (targetRelease) {
    const albumId = `release-${targetRelease.id}`
    if (!entityIds.has(albumId)) {
      entities.push({
        id: albumId,
        mbid: targetRelease.id,
        name: targetRelease.title,
        type: 'album',
        releaseType: mapPrimaryType(targetRelease['release-group']?.['primary-type']),
        isExpanded: false,
        isHidden: false,
        childrenLoaded: false,
      })
      entityIds.add(albumId)
    }

    // Album -> Track relationship (album contains track)
    relationships.push({
      id: `rel-${albumId}-${trackId}`,
      source: albumId,
      target: trackId,
      role: 'contains',
    })

    // Connect only PRIMARY artists to album (not featured artists)
    // This correctly handles:
    // - Single artist albums: "Graduation" -> Kanye West
    // - Collaborative albums: "Watch The Throne" -> Kanye West AND Jay-Z (both primary)
    // - Tracks with features: Featured artists only connect to the track, not album
    for (const artistId of albumArtistIds) {
      relationships.push({
        id: `rel-${artistId}-${albumId}`,
        source: artistId,
        target: albumId,
        role: 'released_on',
      })
    }
  }

  // Add personnel from relations (already fetched with full recording details)
  const artistRelations = (fullRecording.relations || []).filter(r => r.artist)
  const workRelationsCount = (fullRecording.relations || []).filter(r => r.work).length
  console.log(`[MusicBrainz] Processing personnel: ${artistRelations.length} artist relations, ${workRelationsCount} work relations`)

  // Log all artist relations for debugging
  if (artistRelations.length > 0) {
    console.log('[MusicBrainz] Artist relations from recording:')
    for (const rel of artistRelations) {
      const attrs = rel.attributes?.length ? ` [${rel.attributes.join(', ')}]` : ''
      console.log(`  - ${rel.artist!.name}: ${rel.type}${attrs}`)
    }
  }

  try {
    // Add personnel from relations
    for (const rel of fullRecording.relations || []) {
      if (rel.artist) {
        const personnelId = `artist-${rel.artist.id}`
        const normalizedName = normalizeArtistName(rel.artist.name)

        // Check if this artist already exists by:
        // 1. Same MBID (direct match)
        // 2. Same normalized name (e.g., "J.I.D." vs "JID")
        // 3. Alias resolution (e.g., "Abel Tesfaye" → "The Weeknd")
        let effectivePersonnelId = personnelId

        // First, check alias resolution
        const canonicalMbid = resolveArtistAlias(rel.artist.name)
        if (canonicalMbid && canonicalMbid !== rel.artist.id) {
          const canonicalId = `artist-${canonicalMbid}`
          if (entityIds.has(canonicalId)) {
            effectivePersonnelId = canonicalId
            const canonicalName = getCanonicalName(canonicalMbid)
            console.log(`[MusicBrainz] Alias match: "${rel.artist.name}" → "${canonicalName}" (personnel)`)
          }
        }
        // Then check normalized name
        else if (normalizedArtistNames.has(normalizedName) && !entityIds.has(personnelId)) {
          const existingArtist = entities.find(e => normalizeArtistName(e.name) === normalizedName && e.type === 'artist')
          if (existingArtist) {
            effectivePersonnelId = existingArtist.id
            console.log(`[MusicBrainz] Deduped personnel: "${rel.artist.name}" → "${existingArtist.name}"`)
          }
        }

        // Skip if this is already a primary artist (don't duplicate)
        if (primaryArtistIds.has(effectivePersonnelId)) {
          // But still add the specific role relationship if it's different
          const role = mapMBRelationType(rel.type, rel.attributes)
          if (role !== 'primary_artist') {
            const relId = `rel-${trackId}-${effectivePersonnelId}-${role}`
            // Skip if this exact relationship already exists (deduplication)
            if (!relationships.some(r => r.id === relId)) {
              relationships.push({
                id: relId,
                source: trackId,
                target: effectivePersonnelId,
                role,
              })
            }
          }
          continue
        }

        if (!entityIds.has(effectivePersonnelId) && !normalizedArtistNames.has(normalizedName)) {
          entities.push({
            id: personnelId,
            mbid: rel.artist.id,
            name: rel.artist.name,
            type: 'artist',
            isExpanded: false,
            isHidden: false,
            childrenLoaded: false,
          })
          normalizedArtistNames.add(normalizedName)
          entityIds.add(personnelId)
        }

        // Add relationship with specific role (use effective ID for deduplication)
        const role = mapMBRelationType(rel.type, rel.attributes)
        const relId = `rel-${trackId}-${effectivePersonnelId}-${role}`
        // Skip if this exact relationship already exists (deduplication)
        if (!relationships.some(r => r.id === relId)) {
          relationships.push({
            id: relId,
            source: trackId,
            target: effectivePersonnelId,
            role,
          })
        }
      }
    }

    // Process work relations to get songwriter/composer credits
    // Work relations link the recording to a "work" (the composition)
    // The work itself has artist relations like composer, lyricist, writer
    const workRelations = (fullRecording.relations || []).filter(rel => rel.work)
    if (workRelations.length > 0) {
      console.log(`[MusicBrainz] Found ${workRelations.length} work relation(s), fetching songwriter credits...`)

      for (const workRel of workRelations) {
        if (!workRel.work) continue

        try {
          // Fetch the work's artist relations
          const workData = await fetchMB<{
            id: string
            title: string
            relations?: MBRelation[]
          }>(`/work/${workRel.work.id}`, {
            inc: 'artist-rels',
          })

          if (workData.relations) {
            console.log(`[MusicBrainz] Work "${workData.title}" has ${workData.relations.length} artist relation(s)`)

            for (const rel of workData.relations) {
              if (!rel.artist) continue

              const personnelId = `artist-${rel.artist.id}`
              const normalizedName = normalizeArtistName(rel.artist.name)

              // Check if this artist already exists by:
              // 1. Same MBID (direct match)
              // 2. Same normalized name (e.g., "J.I.D." vs "JID")
              // 3. Alias resolution (e.g., "Abel Tesfaye" → "The Weeknd")
              let effectivePersonnelId = personnelId

              // First, check alias resolution - this handles "Abel Tesfaye" → "The Weeknd"
              const canonicalMbid = resolveArtistAlias(rel.artist.name)
              if (canonicalMbid && canonicalMbid !== rel.artist.id) {
                const canonicalId = `artist-${canonicalMbid}`
                if (entityIds.has(canonicalId)) {
                  effectivePersonnelId = canonicalId
                  const canonicalName = getCanonicalName(canonicalMbid)
                  console.log(`[MusicBrainz] Alias match: "${rel.artist.name}" → "${canonicalName}" (work relation)`)
                }
              }
              // Then check normalized name (for punctuation variations)
              else if (normalizedArtistNames.has(normalizedName) && !entityIds.has(personnelId)) {
                const existingArtist = entities.find(e => normalizeArtistName(e.name) === normalizedName && e.type === 'artist')
                if (existingArtist) {
                  effectivePersonnelId = existingArtist.id
                  console.log(`[MusicBrainz] Deduped work relation: "${rel.artist.name}" → "${existingArtist.name}"`)
                }
              }

              // Map work relation types to specific roles
              const workRole = rel.type.toLowerCase()
              let role: Relationship['role'] = 'songwriter'
              if (workRole === 'composer' || workRole === 'music by' || workRole === 'composed by') {
                role = 'composer'
              } else if (workRole === 'lyricist' || workRole === 'lyrics by') {
                role = 'lyricist'
              } else if (workRole === 'writer' || workRole === 'written by') {
                role = 'songwriter'
              } else if (workRole === 'arranger' || workRole === 'arranged by') {
                role = 'arranger'
              }

              // Skip if this exact relationship already exists (use MAPPED role for dedup)
              const relId = `rel-${trackId}-${effectivePersonnelId}-${role}`
              if (relationships.some(r => r.id === relId)) continue

              // Add the artist entity if not already present
              if (!entityIds.has(effectivePersonnelId) && !normalizedArtistNames.has(normalizedName)) {
                entities.push({
                  id: personnelId,
                  mbid: rel.artist.id,
                  name: rel.artist.name,
                  type: 'artist',
                  isExpanded: false,
                  isHidden: false,
                  childrenLoaded: false,
                })
                entityIds.add(personnelId)
                normalizedArtistNames.add(normalizedName)
              }

              relationships.push({
                id: relId,
                source: trackId,
                target: effectivePersonnelId,
                role,
              })

              console.log(`[MusicBrainz] Added ${rel.type}: ${rel.artist.name}`)
            }
          }
        } catch (e) {
          console.warn(`[MusicBrainz] Failed to fetch work relations for ${workRel.work.id}:`, e)
        }
      }
    }
  } catch (e) {
    console.warn('[MusicBrainz] Failed to fetch personnel:', e)
    // Continue without personnel - we still have the basic graph
  }

  console.log(`[MusicBrainz] Flat graph: ${entities.length} entities, ${relationships.length} relationships`)

  // Always try Discogs to supplement MusicBrainz credits
  // Discogs often has additional credits like session musicians, mixing engineers, etc.
  if (isDiscogsConfigured()) {
    console.log('[MusicBrainz] Fetching additional credits from Discogs...')

    try {
      const discogsCredits = await getDiscogsCredits(trackName, artistName, albumName, trackId)

      if (discogsCredits.entities.length > 0) {
        console.log(`[Discogs] Found ${discogsCredits.entities.length} additional credits`)

        // Merge Discogs entities, avoiding duplicates by:
        // 1. Normalized name match
        // 2. Alias resolution (e.g., "Abel Tesfaye" from Discogs → "The Weeknd" from MusicBrainz)
        const existingNames = new Set(entities.map(e => normalizeArtistName(e.name)))
        for (const entity of discogsCredits.entities) {
          const normalizedName = normalizeArtistName(entity.name)

          // Check if this is an alias of an existing artist
          const canonicalMbid = resolveArtistAlias(entity.name)
          if (canonicalMbid) {
            const canonicalId = `artist-${canonicalMbid}`
            if (entityIds.has(canonicalId)) {
              const canonicalName = getCanonicalName(canonicalMbid)
              console.log(`[Discogs] Alias match: "${entity.name}" → "${canonicalName}" (skipping duplicate)`)
              continue // Skip - already have this artist
            }
          }

          // Check normalized name match
          if (!existingNames.has(normalizedName)) {
            entities.push(entity)
            existingNames.add(normalizedName)
            entityIds.add(entity.id)
          }
        }

        // Merge relationships, mapping Discogs artist IDs to existing entities
        for (const rel of discogsCredits.relationships) {
          const discogsEntity = discogsCredits.entities.find(e => e.id === rel.target)
          if (discogsEntity) {
            const normalizedDiscogsName = normalizeArtistName(discogsEntity.name)

            // First, try alias resolution
            const canonicalMbid = resolveArtistAlias(discogsEntity.name)
            if (canonicalMbid) {
              const canonicalId = `artist-${canonicalMbid}`
              if (entityIds.has(canonicalId)) {
                rel.target = canonicalId
                rel.id = `rel-${trackId}-${canonicalId}-${rel.role}-discogs`
                const canonicalName = getCanonicalName(canonicalMbid)
                console.log(`[Discogs] Alias remap: "${discogsEntity.name}" → "${canonicalName}" (relationship)`)
              }
            }
            // Then try normalized name match
            else {
              const existingEntity = entities.find(e =>
                normalizeArtistName(e.name) === normalizedDiscogsName && e.type === 'artist'
              )
              if (existingEntity && existingEntity.id !== rel.target) {
                rel.target = existingEntity.id
                rel.id = `rel-${trackId}-${existingEntity.id}-${rel.role}-discogs`
              }
            }
          }

          // Ensure source is our track
          rel.source = trackId

          // Check for duplicate relationships
          const isDuplicate = relationships.some(r =>
            r.source === rel.source && r.target === rel.target && r.role === rel.role
          )
          if (!isDuplicate) {
            relationships.push(rel)
          }
        }

        console.log(`[Discogs] Merged credits. Total: ${entities.length} entities, ${relationships.length} relationships`)
      }
    } catch (e) {
      console.warn('[Discogs] Fallback failed:', e)
      // Continue without Discogs data
    }
  }

  // Fetch images for artists and album (in parallel, non-blocking)
  console.log('[MusicBrainz] Fetching images...')
  try {
    const imagePromises: Promise<void>[] = []

    // Get all artist entities that need images
    const artistEntities = entities.filter(e => e.type === 'artist' && !e.image)

    // Prioritize: primary artists first, then others (limit to avoid rate limiting)
    const primaryArtists = artistEntities.filter(e => primaryArtistIds.has(e.id))
    const otherArtists = artistEntities.filter(e => !primaryArtistIds.has(e.id))

    // Fetch primary artists first (no limit) - try Last.fm then TheAudioDB
    for (const entity of primaryArtists) {
      imagePromises.push(
        getArtistImage(entity.name, entity.mbid).then(image => {
          if (image) entity.image = image
        }).catch(() => {})
      )
    }

    // Fetch up to 5 additional artists (producers, featured, etc.)
    const additionalArtistsLimit = 5
    for (const entity of otherArtists.slice(0, additionalArtistsLimit)) {
      imagePromises.push(
        getArtistImage(entity.name, entity.mbid).then(image => {
          if (image) entity.image = image
        }).catch(() => {})
      )
    }

    // Fetch album image (use album artist, not featured artist)
    const albumEntity = entities.find(e => e.type === 'album')
    if (albumEntity && !albumEntity.image) {
      const albumArtist = entities.find(e => albumArtistIds.has(e.id))
      if (albumArtist) {
        imagePromises.push(
          getAlbumImage(albumArtist.name, albumEntity.name).then(image => {
            if (image) albumEntity.image = image
          }).catch(() => {})
        )
      }
    }

    // Wait for all images (with a longer timeout since TheAudioDB rate limits to 1 req/2sec)
    // With up to 6-7 artist images + 1 album, we need ~15 seconds
    await Promise.race([
      Promise.all(imagePromises),
      new Promise(resolve => setTimeout(resolve, 15000)) // 15 second timeout
    ])

    // Fetch track image: prefer single artwork if track was released as a single
    const trackEntity = entities.find(e => e.type === 'track')
    const albumEntityForTrack = entities.find(e => e.type === 'album')

    if (trackEntity && !trackEntity.image) {
      if (singleRelease) {
        // Track was released as a single - fetch single's cover art
        const singleArtist = entities.find(e => albumArtistIds.has(e.id))
        if (singleArtist) {
          const singleImage = await getAlbumImage(singleArtist.name, singleRelease.title).catch(() => undefined)
          if (singleImage) {
            trackEntity.image = singleImage
            console.log(`[MusicBrainz] Using single artwork for track: "${singleRelease.title}"`)
          }
        }
      }

      // Fall back to album art if no single image found
      if (!trackEntity.image && albumEntityForTrack?.image) {
        trackEntity.image = albumEntityForTrack.image
      }
    }

    console.log(`[MusicBrainz] Images fetched for ${imagePromises.length} entities`)
  } catch (e) {
    console.warn('[MusicBrainz] Failed to fetch some images:', e)
  }

  // Cache the result for future use
  const result = { entities, relationships }
  setCachedTrack(trackName, artistName, albumName, entities, relationships)

  return result
}

export async function getArtistRelations(artistId: string): Promise<MusicGraph> {
  const data = await fetchMB<{ relations: MBRelation[] }>(`/artist/${artistId}`, {
    inc: 'artist-rels+recording-rels+release-rels',
  })

  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  // Add the main artist
  const mainArtist = await fetchMB<MBArtist>(`/artist/${artistId}`, {})
  entities.push({
    id: `artist-${artistId}`,
    name: mainArtist.name,
    type: 'artist',
  })
  entityIds.add(`artist-${artistId}`)

  // Process relations
  for (const rel of data.relations || []) {
    if (rel.artist && !entityIds.has(`artist-${rel.artist.id}`)) {
      entities.push({
        id: `artist-${rel.artist.id}`,
        name: rel.artist.name,
        type: 'artist',
      })
      entityIds.add(`artist-${rel.artist.id}`)

      relationships.push({
        id: `rel-${relationships.length}`,
        source: `artist-${artistId}`,
        target: `artist-${rel.artist.id}`,
        role: mapMBRelationType(rel.type, rel.attributes),
      })
    }

    if (rel.recording && !entityIds.has(`track-${rel.recording.id}`)) {
      entities.push({
        id: `track-${rel.recording.id}`,
        name: rel.recording.title,
        type: 'track',
      })
      entityIds.add(`track-${rel.recording.id}`)

      relationships.push({
        id: `rel-${relationships.length}`,
        source: `track-${rel.recording.id}`,
        target: `artist-${artistId}`,
        role: mapMBRelationType(rel.type, rel.attributes),
      })
    }
  }

  return { entities, relationships }
}

export async function getRecordingCredits(recordingId: string): Promise<MusicGraph> {
  const data = await fetchMB<{
    title: string
    relations: MBRelation[]
    'artist-credit': Array<{ artist: MBArtist }>
  }>(`/recording/${recordingId}`, {
    inc: 'artist-credits+artist-rels',
  })

  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  // Add the track
  entities.push({
    id: `track-${recordingId}`,
    name: data.title,
    type: 'track',
  })
  entityIds.add(`track-${recordingId}`)

  // Add credited artists
  for (const credit of data['artist-credit'] || []) {
    const artistId = `artist-${credit.artist.id}`
    if (!entityIds.has(artistId)) {
      entities.push({
        id: artistId,
        name: credit.artist.name,
        type: 'artist',
      })
      entityIds.add(artistId)
    }

    relationships.push({
      id: `rel-${relationships.length}`,
      source: `track-${recordingId}`,
      target: artistId,
      role: 'primary_artist',
    })
  }

  // Add related artists
  for (const rel of data.relations || []) {
    if (rel.artist) {
      const artistId = `artist-${rel.artist.id}`
      if (!entityIds.has(artistId)) {
        entities.push({
          id: artistId,
          name: rel.artist.name,
          type: 'artist',
        })
        entityIds.add(artistId)
      }

      relationships.push({
        id: `rel-${relationships.length}`,
        source: `track-${recordingId}`,
        target: artistId,
        role: mapMBRelationType(rel.type, rel.attributes),
      })
    }
  }

  return { entities, relationships }
}

function mapMBRelationType(mbType: string, attributes?: string[]): Relationship['role'] {
  const lowerType = mbType.toLowerCase()
  const attrs = (attributes || []).map(a => a.toLowerCase())

  // Handle "instrument" type - actual instrument is in attributes
  if (lowerType === 'instrument' || lowerType === 'performer') {
    // Check each attribute for instrument matches
    for (const attr of attrs) {
      // Drums & Percussion
      if (attr.includes('drum')) return 'drums'
      if (attr.includes('percuss') || attr === 'congas' || attr === 'bongos' || attr === 'tambourine' || attr === 'shaker') return 'percussion'
      // Guitar family
      if (attr.includes('guitar') || attr === 'banjo' || attr === 'mandolin' || attr === 'ukulele') return 'guitar'
      // Bass
      if (attr.includes('bass')) return 'bass'
      // Piano specifically
      if (attr.includes('piano') || attr === 'rhodes' || attr === 'wurlitzer') return 'piano'
      // Synthesizer
      if (attr.includes('synth')) return 'synthesizer'
      // Organ
      if (attr.includes('organ')) return 'organ'
      // Generic keyboards
      if (attr.includes('keyboard') || attr === 'clavinet') return 'keyboards'
      // Strings
      if (attr.includes('violin') || attr === 'fiddle') return 'violin'
      if (attr.includes('cello')) return 'cello'
      if (attr.includes('string') || attr === 'viola' || attr === 'orchestra' || attr === 'harp') return 'strings'
      // Brass
      if (attr.includes('trumpet')) return 'trumpet'
      if (attr.includes('sax')) return 'saxophone'
      if (attr.includes('horn') || attr.includes('trombone') || attr.includes('tuba') || attr === 'brass') return 'horns'
      // Woodwinds
      if (attr.includes('flute')) return 'flute'
      if (attr.includes('clarinet') || attr.includes('oboe') || attr.includes('bassoon') || attr === 'woodwinds') return 'woodwinds'
      // Other
      if (attr.includes('harmonica')) return 'harmonica'
      if (attr.includes('turntable') || attr === 'dj' || attr.includes('scratch')) return 'turntables'
    }
    // Unknown instrument
    return 'other_instrument'
  }

  // Handle producer with attributes for stratification
  if (lowerType === 'producer') {
    if (attrs.includes('executive')) {
      return 'executive_producer'
    }
    if (attrs.includes('co')) {
      return 'co_producer'
    }
    if (attrs.some(a => a.includes('vocal'))) {
      return 'vocal_producer'
    }
    if (attrs.includes('additional')) {
      return 'additional_producer'
    }
    return 'producer'
  }

  // Handle vocal with attributes for background vocals
  if (lowerType === 'vocal') {
    if (attrs.some(a => a.includes('background') || a.includes('backing'))) {
      return 'background_vocals'
    }
    if (attrs.some(a => a.includes('choir') || a.includes('chorus'))) {
      return 'choir'
    }
    return 'vocals'
  }

  const typeMap: Record<string, Relationship['role']> = {
    // Vocals
    'vocal': 'vocals',
    'lead vocals': 'vocals',
    'background vocals': 'background_vocals',
    'backing vocals': 'background_vocals',
    'guest': 'featured',
    'choir': 'choir',
    'chorus': 'choir',
    // Guitar
    'guitar': 'guitar',
    'electric guitar': 'guitar',
    'acoustic guitar': 'guitar',
    'rhythm guitar': 'guitar',
    'lead guitar': 'guitar',
    'classical guitar': 'guitar',
    '12-string guitar': 'guitar',
    // Bass
    'bass': 'bass',
    'bass guitar': 'bass',
    'electric bass guitar': 'bass',
    'double bass': 'bass',
    'upright bass': 'bass',
    'fretless bass': 'bass',
    // Drums & Percussion
    'drums': 'drums',
    'drums (drum set)': 'drums',
    'drum machine': 'drums',
    'percussion': 'percussion',
    'congas': 'percussion',
    'bongos': 'percussion',
    'tambourine': 'percussion',
    'shaker': 'percussion',
    'timpani': 'percussion',
    // Piano
    'piano': 'piano',
    'grand piano': 'piano',
    'electric piano': 'piano',
    'rhodes': 'piano',
    'wurlitzer': 'piano',
    'clavinet': 'keyboards',
    // Keyboards & Synths
    'keyboard': 'keyboards',
    'keyboards': 'keyboards',
    'synthesizer': 'synthesizer',
    'synth': 'synthesizer',
    'analog synthesizer': 'synthesizer',
    'digital synthesizer': 'synthesizer',
    'modular synthesizer': 'synthesizer',
    // Organ
    'organ': 'organ',
    'hammond organ': 'organ',
    'pipe organ': 'organ',
    // Strings
    'violin': 'violin',
    'viola': 'strings',
    'cello': 'cello',
    'strings': 'strings',
    'string section': 'strings',
    'orchestra': 'strings',
    'orchestration': 'arranger',
    // Brass
    'trumpet': 'trumpet',
    'trombone': 'horns',
    'french horn': 'horns',
    'tuba': 'horns',
    'brass': 'horns',
    'horn section': 'horns',
    'horns': 'horns',
    // Woodwinds
    'saxophone': 'saxophone',
    'alto saxophone': 'saxophone',
    'tenor saxophone': 'saxophone',
    'baritone saxophone': 'saxophone',
    'flute': 'flute',
    'clarinet': 'woodwinds',
    'oboe': 'woodwinds',
    'bassoon': 'woodwinds',
    'woodwinds': 'woodwinds',
    // Other instruments
    'harmonica': 'harmonica',
    'accordion': 'keyboards',
    'banjo': 'guitar',
    'mandolin': 'guitar',
    'ukulele': 'guitar',
    'harp': 'strings',
    'turntables': 'turntables',
    'dj': 'turntables',
    'scratching': 'turntables',
    // Engineering - specific roles
    'mix': 'mixing',
    'mixing': 'mixing',
    'mastering': 'mastering',
    'recording': 'recording',
    'engineer': 'engineer',
    'audio engineer': 'engineer',
    'sound engineer': 'engineer',
    'programming': 'programming',
    'drum programming': 'programming',
    'synth programming': 'programming',
    // Songwriting - specific roles
    'writer': 'songwriter',
    'songwriter': 'songwriter',
    'composer': 'composer',
    'lyricist': 'lyricist',
    'arranger': 'arranger',
    'music by': 'composer',
    'lyrics by': 'lyricist',
    'arranged by': 'arranger',
    // Remix
    'remix': 'remixer',
    'remixer': 'remixer',
    'remixed by': 'remixer',
    // Band membership
    'member of band': 'member_of',
    'is person': 'member_of',
  }

  // Check for exact matches first
  if (typeMap[lowerType]) {
    return typeMap[lowerType]
  }

  // Partial matching for instruments (more specific first)
  if (lowerType.includes('remix')) return 'remixer'
  if (lowerType.includes('background vocal') || lowerType.includes('backing vocal')) return 'background_vocals'
  if (lowerType.includes('vocal') || lowerType.includes('voice') || lowerType.includes('singer')) return 'vocals'
  if (lowerType.includes('choir') || lowerType.includes('chorus')) return 'choir'
  if (lowerType.includes('guitar') || lowerType.includes('banjo') || lowerType.includes('mandolin')) return 'guitar'
  if (lowerType.includes('bass')) return 'bass'
  if (lowerType.includes('drum')) return 'drums'
  if (lowerType.includes('percuss')) return 'percussion'
  if (lowerType.includes('synth')) return 'synthesizer'
  if (lowerType.includes('piano') || lowerType.includes('rhodes') || lowerType.includes('wurlitzer')) return 'piano'
  if (lowerType.includes('organ')) return 'organ'
  if (lowerType.includes('keyboard')) return 'keyboards'
  if (lowerType.includes('violin') || lowerType.includes('fiddle')) return 'violin'
  if (lowerType.includes('cello')) return 'cello'
  if (lowerType.includes('string') || lowerType.includes('orchestra')) return 'strings'
  if (lowerType.includes('trumpet')) return 'trumpet'
  if (lowerType.includes('sax')) return 'saxophone'
  if (lowerType.includes('flute')) return 'flute'
  if (lowerType.includes('horn') || lowerType.includes('brass') || lowerType.includes('trombone') || lowerType.includes('tuba')) return 'horns'
  if (lowerType.includes('clarinet') || lowerType.includes('oboe') || lowerType.includes('bassoon') || lowerType.includes('woodwind')) return 'woodwinds'
  if (lowerType.includes('harmonica')) return 'harmonica'
  if (lowerType.includes('turntable') || lowerType.includes('dj') || lowerType.includes('scratch')) return 'turntables'
  if (lowerType.includes('programm')) return 'programming'
  if (lowerType.includes('master')) return 'mastering'
  if (lowerType.includes('mix')) return 'mixing'
  if (lowerType.includes('record')) return 'recording'
  if (lowerType.includes('engineer')) return 'engineer'
  if (lowerType.includes('arrang')) return 'arranger'
  if (lowerType.includes('lyric')) return 'lyricist'
  if (lowerType.includes('compos')) return 'composer'

  // Default: log unknown and return other_instrument for actual instruments, featured for performers
  console.log(`[MusicBrainz] Unknown relation type: ${mbType}`)
  return 'other_instrument'
}

export async function searchAndBuildGraph(query: string): Promise<MusicGraph> {
  const artists = await searchArtist(query)
  if (artists.length === 0) {
    return { entities: [], relationships: [] }
  }

  // Get the first matching artist's relations
  return getArtistRelations(artists[0]!.id)
}

// ============================================
// DRILL-DOWN NAVIGATION FUNCTIONS
// ============================================

function mapPrimaryType(mbType?: string): ReleaseType {
  if (!mbType) return 'Other'
  const type = mbType.toLowerCase()
  if (type === 'album') return 'Album'
  if (type === 'single') return 'Single'
  if (type === 'ep') return 'EP'
  return 'Other'
}

/**
 * Get all release groups for an artist, grouped by type
 */
export async function getArtistReleases(artistMbid: string): Promise<{
  albums: MBReleaseGroup[]
  singles: MBReleaseGroup[]
  eps: MBReleaseGroup[]
  other: MBReleaseGroup[]
}> {
  console.log('[MusicBrainz] Getting releases for artist:', artistMbid)

  const data = await fetchMB<{ 'release-groups': MBReleaseGroup[] }>(
    '/release-group',
    { artist: artistMbid, limit: '100' }
  )

  const groups = {
    albums: [] as MBReleaseGroup[],
    singles: [] as MBReleaseGroup[],
    eps: [] as MBReleaseGroup[],
    other: [] as MBReleaseGroup[],
  }

  for (const rg of data['release-groups'] || []) {
    const type = rg['primary-type']?.toLowerCase()
    if (type === 'album') groups.albums.push(rg)
    else if (type === 'single') groups.singles.push(rg)
    else if (type === 'ep') groups.eps.push(rg)
    else groups.other.push(rg)
  }

  console.log(`[MusicBrainz] Found ${groups.albums.length} albums, ${groups.singles.length} singles, ${groups.eps.length} EPs`)
  return groups
}

/**
 * Get all recordings (tracks) for a release group
 * We need to first get releases in the group, then get tracks from the first release
 */
export async function getReleaseRecordings(releaseGroupMbid: string): Promise<MBRecording[]> {
  console.log('[MusicBrainz] Getting recordings for release group:', releaseGroupMbid)

  // First, get releases in this release group
  const releasesData = await fetchMB<{ releases: Array<{ id: string; date?: string }> }>(
    '/release',
    { 'release-group': releaseGroupMbid, limit: '10' }
  )

  const releases = releasesData.releases || []
  if (releases.length === 0) {
    console.log('[MusicBrainz] No releases found for release group')
    return []
  }

  // Get the first (or most complete) release's tracks
  // Sort by date to get earliest official release
  releases.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const releaseId = releases[0]!.id

  // Get tracks from this release
  const releaseData = await fetchMB<{ media: MBMedium[] }>(
    `/release/${releaseId}`,
    { inc: 'recordings+artist-credits' }
  )

  const recordings: MBRecording[] = []
  for (const medium of releaseData.media || []) {
    for (const track of medium.tracks || []) {
      recordings.push(track.recording)
    }
  }

  console.log(`[MusicBrainz] Found ${recordings.length} tracks`)
  return recordings
}

/**
 * Initialize the graph with an artist and their releases (albums, singles, EPs)
 * This is the entry point for drill-down navigation
 */
export async function initializeArtistGraph(artistName: string): Promise<DrillDownResult> {
  console.log('[MusicBrainz] Initializing graph for:', artistName)

  // Search for the artist
  const artists = await searchArtist(artistName)
  if (artists.length === 0) {
    throw new Error('Artist not found')
  }

  const artist = artists[0]!
  const artistId = `artist-${artist.id}`

  // Create artist entity
  const artistEntity: MusicEntity = {
    id: artistId,
    mbid: artist.id,
    name: artist.name,
    type: 'artist',
    depth: 0,
    isExpanded: true,
    isHidden: false,
    childrenLoaded: true,
  }

  // Get releases
  const releases = await getArtistReleases(artist.id)
  const allReleases = [
    ...releases.albums,
    ...releases.singles,
    ...releases.eps,
  ]

  artistEntity.childCount = allReleases.length

  // Create release entities
  const releaseEntities: MusicEntity[] = allReleases.map(rg => ({
    id: `release-${rg.id}`,
    mbid: rg.id,
    name: rg.title,
    type: 'album' as const,
    releaseType: mapPrimaryType(rg['primary-type']),
    parentId: artistId,
    depth: 1,
    isExpanded: false,
    isHidden: false,
    childrenLoaded: false,
    metadata: rg['first-release-date'] ? { releaseDate: rg['first-release-date'] } : undefined,
  }))

  // Create relationships (artist -> releases)
  const relationships: Relationship[] = releaseEntities.map((release) => ({
    id: `rel-${artistId}-${release.id}`,
    source: artistId,
    target: release.id,
    role: 'released_on' as const,
  }))

  console.log(`[MusicBrainz] Graph initialized: 1 artist, ${releaseEntities.length} releases`)

  return {
    entities: [artistEntity, ...releaseEntities],
    relationships,
  }
}

/**
 * Expand a release to show its tracks
 */
export async function expandRelease(releaseEntity: MusicEntity): Promise<DrillDownResult> {
  if (!releaseEntity.mbid) {
    throw new Error('Release has no MusicBrainz ID')
  }

  console.log('[MusicBrainz] Expanding release:', releaseEntity.name)

  const recordings = await getReleaseRecordings(releaseEntity.mbid)

  const trackEntities: MusicEntity[] = recordings.map(rec => ({
    id: `track-${rec.id}`,
    mbid: rec.id,
    name: rec.title,
    type: 'track' as const,
    parentId: releaseEntity.id,
    depth: 2,
    isExpanded: false,
    isHidden: false,
    childrenLoaded: false,
  }))

  const relationships: Relationship[] = trackEntities.map(track => ({
    id: `rel-${releaseEntity.id}-${track.id}`,
    source: releaseEntity.id,
    target: track.id,
    role: 'contains' as const,
  }))

  console.log(`[MusicBrainz] Expanded release: ${trackEntities.length} tracks`)

  return {
    entities: trackEntities,
    relationships,
  }
}

/**
 * Expand a track to show its personnel (credits)
 */
export async function expandTrack(trackEntity: MusicEntity): Promise<DrillDownResult> {
  if (!trackEntity.mbid) {
    throw new Error('Track has no MusicBrainz ID')
  }

  console.log('[MusicBrainz] Expanding track:', trackEntity.name)

  const data = await fetchMB<{
    title: string
    relations?: MBRelation[]
    'artist-credit'?: Array<{ artist: MBArtist; joinphrase?: string }>
  }>(`/recording/${trackEntity.mbid}`, {
    inc: 'artist-credits+artist-rels+work-rels',
  })

  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const seenArtists = new Set<string>()

  // Add credited artists (primary and featured)
  // MusicBrainz uses joinphrase to indicate featured artists
  const artistCredits = data['artist-credit'] || []
  let nextIsFeatured = false

  for (let i = 0; i < artistCredits.length; i++) {
    const credit = artistCredits[i]!
    const artistId = `artist-${credit.artist.id}`

    // Determine if this artist is featured based on the PREVIOUS joinphrase
    const isFeatured = nextIsFeatured

    // Check if the joinphrase indicates the NEXT artist is featured
    const joinphrase = (credit.joinphrase || '').toLowerCase()
    nextIsFeatured = joinphrase.includes('feat') ||
                     joinphrase.includes('ft.') ||
                     joinphrase.includes('featuring') ||
                     joinphrase.includes('with ')

    if (!seenArtists.has(artistId)) {
      entities.push({
        id: artistId,
        mbid: credit.artist.id,
        name: credit.artist.name,
        type: 'artist',
        parentId: trackEntity.id,
        depth: 3,
        isExpanded: false,
        isHidden: false,
        childrenLoaded: false, // Leaf node for now
      })
      seenArtists.add(artistId)
    }

    const role = isFeatured ? 'featured' : 'primary_artist'
    relationships.push({
      id: `rel-${trackEntity.id}-${artistId}-${role}`,
      source: trackEntity.id,
      target: artistId,
      role,
    })
  }

  // Add related artists (producers, engineers, etc.)
  for (const rel of data.relations || []) {
    if (rel.artist) {
      const artistId = `artist-${rel.artist.id}`
      if (!seenArtists.has(artistId)) {
        entities.push({
          id: artistId,
          mbid: rel.artist.id,
          name: rel.artist.name,
          type: 'artist',
          parentId: trackEntity.id,
          depth: 3,
          isExpanded: false,
          isHidden: false,
          childrenLoaded: false,
        })
        seenArtists.add(artistId)
      }

      relationships.push({
        id: `rel-${trackEntity.id}-${artistId}-${rel.type}`,
        source: trackEntity.id,
        target: artistId,
        role: mapMBRelationType(rel.type, rel.attributes),
      })
    }
  }

  console.log(`[MusicBrainz] Expanded track: ${entities.length} personnel`)

  return {
    entities,
    relationships,
  }
}
