/**
 * Last.fm API Integration
 *
 * Last.fm provides excellent music metadata including:
 * - Artist info, similar artists, top tracks
 * - Album info, track listings
 * - User scrobble history (listening history)
 * - Tags and genres
 *
 * To use:
 * 1. Create an account at https://www.last.fm/api/account/create
 * 2. Get your API key (free, instant)
 * 3. Set your API key below
 */

import type { MusicGraph, MusicEntity, Relationship } from '../types/music'

// Configuration - Set VITE_LASTFM_API_KEY in your .env file
const API_KEY = import.meta.env.VITE_LASTFM_API_KEY || ''
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/'

/**
 * Check if Last.fm API is configured
 */
export function isConfigured(): boolean {
  return API_KEY.length > 0
}

interface LastFmArtist {
  name: string
  mbid?: string
  url: string
  image?: Array<{ '#text': string; size: string }>
  similar?: { artist: LastFmArtist[] }
  tags?: { tag: Array<{ name: string }> }
  bio?: { summary: string; content: string }
  stats?: { listeners: string; playcount: string }
}

interface LastFmTrack {
  name: string
  mbid?: string
  url: string
  duration?: string
  artist: { name: string; mbid?: string }
  album?: { title: string; mbid?: string }
  toptags?: { tag: Array<{ name: string }> }
}

interface LastFmAlbum {
  name: string
  mbid?: string
  url: string
  artist: string
  image?: Array<{ '#text': string; size: string }>
  tracks?: { track: LastFmTrack[] }
  tags?: { tag: Array<{ name: string }> }
}

interface LastFmScrobble {
  artist: { '#text': string; mbid?: string }
  name: string
  album: { '#text': string; mbid?: string }
  image?: Array<{ '#text': string; size: string }>
  date?: { uts: string; '#text': string }
  '@attr'?: { nowplaying: string }
}

export interface NowPlayingTrack {
  track: string
  artist: string
  album: string
  image?: string
  isPlaying: boolean
  timestamp?: number // Unix timestamp when scrobbled (if not currently playing)
}

async function fetchLastFm<T>(method: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE_URL)
  url.searchParams.set('method', method)
  url.searchParams.set('api_key', API_KEY)
  url.searchParams.set('format', 'json')

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(`Last.fm API error: ${response.status}`)
  }

  const data = await response.json()

  if (data.error) {
    throw new Error(`Last.fm API error: ${data.message}`)
  }

  return data
}

/**
 * Get artist info including similar artists
 */
export async function getArtistInfo(artist: string): Promise<LastFmArtist | null> {
  try {
    const data = await fetchLastFm<{ artist: LastFmArtist }>('artist.getinfo', {
      artist,
      autocorrect: '1',
    })
    return data.artist
  } catch (e) {
    console.error('Failed to get artist info:', e)
    return null
  }
}

/**
 * Get similar artists
 */
export async function getSimilarArtists(artist: string, limit = 10): Promise<LastFmArtist[]> {
  try {
    const data = await fetchLastFm<{ similarartists: { artist: LastFmArtist[] } }>('artist.getsimilar', {
      artist,
      limit: limit.toString(),
      autocorrect: '1',
    })
    return data.similarartists?.artist || []
  } catch (e) {
    console.error('Failed to get similar artists:', e)
    return []
  }
}

/**
 * Get artist's top tracks
 */
export async function getArtistTopTracks(artist: string, limit = 10): Promise<LastFmTrack[]> {
  try {
    const data = await fetchLastFm<{ toptracks: { track: LastFmTrack[] } }>('artist.gettoptracks', {
      artist,
      limit: limit.toString(),
      autocorrect: '1',
    })
    return data.toptracks?.track || []
  } catch (e) {
    console.error('Failed to get top tracks:', e)
    return []
  }
}

/**
 * Get artist's top albums
 */
export async function getArtistTopAlbums(artist: string, limit = 10): Promise<LastFmAlbum[]> {
  try {
    const data = await fetchLastFm<{ topalbums: { album: LastFmAlbum[] } }>('artist.gettopalbums', {
      artist,
      limit: limit.toString(),
      autocorrect: '1',
    })
    return data.topalbums?.album || []
  } catch (e) {
    console.error('Failed to get top albums:', e)
    return []
  }
}

/**
 * Get album info including track listing
 */
export async function getAlbumInfo(artist: string, album: string): Promise<LastFmAlbum | null> {
  try {
    const data = await fetchLastFm<{ album: LastFmAlbum }>('album.getinfo', {
      artist,
      album,
      autocorrect: '1',
    })
    return data.album
  } catch (e) {
    console.error('Failed to get album info:', e)
    return null
  }
}

/**
 * Get track info
 */
export async function getTrackInfo(artist: string, track: string): Promise<LastFmTrack | null> {
  try {
    const data = await fetchLastFm<{ track: LastFmTrack }>('track.getinfo', {
      artist,
      track,
      autocorrect: '1',
    })
    return data.track
  } catch (e) {
    console.error('Failed to get track info:', e)
    return null
  }
}

/**
 * Get user's recent scrobbles (requires username)
 */
export async function getUserRecentTracks(username: string, limit = 50): Promise<LastFmScrobble[]> {
  try {
    const data = await fetchLastFm<{ recenttracks: { track: LastFmScrobble[] } }>('user.getrecenttracks', {
      user: username,
      limit: limit.toString(),
    })
    return data.recenttracks?.track || []
  } catch (e) {
    console.error('Failed to get recent tracks:', e)
    return []
  }
}

/**
 * Get user's currently playing track (or most recent if not playing)
 */
export async function getNowPlaying(username: string): Promise<NowPlayingTrack | null> {
  try {
    const data = await fetchLastFm<{ recenttracks: { track: LastFmScrobble[] } }>('user.getrecenttracks', {
      user: username,
      limit: '1',
    })

    const tracks = data.recenttracks?.track
    if (!tracks || tracks.length === 0) return null

    const track = tracks[0]!
    const isPlaying = track['@attr']?.nowplaying === 'true'

    return {
      track: track.name,
      artist: track.artist['#text'],
      album: track.album?.['#text'] || '',
      image: getBestImage(track.image),
      isPlaying,
      timestamp: track.date ? parseInt(track.date.uts, 10) : undefined,
    }
  } catch (e) {
    console.error('Failed to get now playing:', e)
    return null
  }
}

/**
 * Get user's top artists
 */
export async function getUserTopArtists(username: string, period: 'overall' | '7day' | '1month' | '3month' | '6month' | '12month' = '1month', limit = 20): Promise<LastFmArtist[]> {
  try {
    const data = await fetchLastFm<{ topartists: { artist: LastFmArtist[] } }>('user.gettopartists', {
      user: username,
      period,
      limit: limit.toString(),
    })
    return data.topartists?.artist || []
  } catch (e) {
    console.error('Failed to get top artists:', e)
    return []
  }
}

/**
 * Search for artists
 */
export async function searchArtist(query: string, limit = 10): Promise<LastFmArtist[]> {
  try {
    const data = await fetchLastFm<{ results: { artistmatches: { artist: LastFmArtist[] } } }>('artist.search', {
      artist: query,
      limit: limit.toString(),
    })
    return data.results?.artistmatches?.artist || []
  } catch (e) {
    console.error('Failed to search artists:', e)
    return []
  }
}

/**
 * Search for tracks
 */
export async function searchTrack(query: string, limit = 10): Promise<LastFmTrack[]> {
  try {
    const data = await fetchLastFm<{ results: { trackmatches: { track: LastFmTrack[] } } }>('track.search', {
      track: query,
      limit: limit.toString(),
    })
    return data.results?.trackmatches?.track || []
  } catch (e) {
    console.error('Failed to search tracks:', e)
    return []
  }
}

// Helper to get best image URL
function getBestImage(images?: Array<{ '#text': string; size: string }>): string | undefined {
  if (!images || images.length === 0) return undefined
  // Prefer large or extralarge
  const large = images.find(img => img.size === 'extralarge' || img.size === 'large')
  const url = large?.['#text'] || images[images.length - 1]?.['#text']
  // Filter out Last.fm placeholder images
  if (url && (url.includes('2a96cbd8b46e442fc41c2b86b821562f') || url === '')) {
    return undefined
  }
  return url
}

/**
 * Get artist image URL from Last.fm
 */
export async function getArtistImage(artistName: string): Promise<string | undefined> {
  try {
    const info = await getArtistInfo(artistName)
    return info ? getBestImage(info.image) : undefined
  } catch {
    return undefined
  }
}

/**
 * Get album image URL from Last.fm
 */
export async function getAlbumImage(artistName: string, albumName: string): Promise<string | undefined> {
  try {
    const info = await getAlbumInfo(artistName, albumName)
    return info ? getBestImage(info.image) : undefined
  } catch {
    return undefined
  }
}

// Helper to create entity ID
function makeId(type: string, name: string): string {
  return `${type}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
}

export interface GraphOptions {
  topTracks?: number       // default 20
  albums?: number          // default 15
  tracksPerAlbum?: number  // default 10, set to 0 to skip album tracks
}

/**
 * Build a graph from an artist, including top tracks and albums with their tracks
 */
export async function buildGraphFromArtist(artistName: string, options: GraphOptions = {}): Promise<MusicGraph> {
  const {
    topTracks = 20,
    albums = 15,
    tracksPerAlbum = 10,
  } = options

  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  // Get main artist info
  console.log('[Last.fm] Fetching artist info for:', artistName)
  const artistInfo = await getArtistInfo(artistName)
  if (!artistInfo) {
    console.error('[Last.fm] Artist not found:', artistName)
    return { entities: [], relationships: [] }
  }

  const mainArtistId = makeId('artist', artistInfo.name)
  entities.push({
    id: mainArtistId,
    name: artistInfo.name,
    type: 'artist',
    image: getBestImage(artistInfo.image),
  })
  entityIds.add(mainArtistId)

  // Get top tracks (these are the artist's most popular tracks overall)
  if (topTracks > 0) {
    console.log('[Last.fm] Fetching top tracks...')
    const artistTopTracks = await getArtistTopTracks(artistInfo.name, topTracks)
    for (const track of artistTopTracks) {
      const trackId = makeId('track', track.name)
      if (!entityIds.has(trackId)) {
        entities.push({
          id: trackId,
          name: track.name,
          type: 'track',
        })
        entityIds.add(trackId)

        relationships.push({
          id: `rel-${relationships.length}`,
          source: trackId,
          target: mainArtistId,
          role: 'primary_artist',
        })
      }
    }
  }

  // Get albums and their tracks
  if (albums > 0) {
    console.log('[Last.fm] Fetching albums...')
    const topAlbums = await getArtistTopAlbums(artistInfo.name, albums)
    console.log(`[Last.fm] Found ${topAlbums.length} albums`)

    for (const album of topAlbums) {
      const albumId = makeId('album', album.name)
      if (!entityIds.has(albumId)) {
        entities.push({
          id: albumId,
          name: album.name,
          type: 'album',
          image: getBestImage(album.image),
        })
        entityIds.add(albumId)

        // Fetch album tracks if requested
        if (tracksPerAlbum > 0) {
          console.log(`[Last.fm] Fetching tracks for album: ${album.name}`)
          const albumInfo = await getAlbumInfo(artistInfo.name, album.name)
          // Last.fm returns object instead of array when there's only 1 track
          let albumTracks = albumInfo?.tracks?.track || []
          if (!Array.isArray(albumTracks)) {
            albumTracks = [albumTracks]
          }

          for (const track of albumTracks.slice(0, tracksPerAlbum)) {
            const trackId = makeId('track', track.name)

            // Add track if not already added
            if (!entityIds.has(trackId)) {
              entities.push({
                id: trackId,
                name: track.name,
                type: 'track',
              })
              entityIds.add(trackId)

              // Track -> Artist relationship
              relationships.push({
                id: `rel-${relationships.length}`,
                source: trackId,
                target: mainArtistId,
                role: 'primary_artist',
              })
            }

            // Album -> Track relationship
            const relKey = `contains-${albumId}-${trackId}`
            if (!entityIds.has(relKey)) {
              relationships.push({
                id: `rel-${relationships.length}`,
                source: albumId,
                target: trackId,
                role: 'contains',
              })
              entityIds.add(relKey)
            }
          }
        }
      }
    }
  }

  console.log(`[Last.fm] Graph complete: ${entities.length} entities, ${relationships.length} relationships`)
  return { entities, relationships }
}

/**
 * Build a graph from a user's listening history
 */
export async function buildGraphFromUserHistory(username: string): Promise<MusicGraph> {
  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  const recentTracks = await getUserRecentTracks(username, 30)

  for (const scrobble of recentTracks) {
    const artistId = makeId('artist', scrobble.artist['#text'])
    const trackId = makeId('track', scrobble.name)

    // Add artist
    if (!entityIds.has(artistId)) {
      entities.push({
        id: artistId,
        name: scrobble.artist['#text'],
        type: 'artist',
      })
      entityIds.add(artistId)
    }

    // Add track
    if (!entityIds.has(trackId)) {
      entities.push({
        id: trackId,
        name: scrobble.name,
        type: 'track',
      })
      entityIds.add(trackId)

      relationships.push({
        id: `rel-${relationships.length}`,
        source: trackId,
        target: artistId,
        role: 'primary_artist',
      })
    }

    // Add album if present
    if (scrobble.album?.['#text']) {
      const albumId = makeId('album', scrobble.album['#text'])
      if (!entityIds.has(albumId)) {
        entities.push({
          id: albumId,
          name: scrobble.album['#text'],
          type: 'album',
        })
        entityIds.add(albumId)
      }

      // Check if relationship already exists
      const relKey = `${albumId}-${trackId}`
      if (!entityIds.has(relKey)) {
        relationships.push({
          id: `rel-${relationships.length}`,
          source: albumId,
          target: trackId,
          role: 'contains',
        })
        entityIds.add(relKey)
      }
    }
  }

  return { entities, relationships }
}
