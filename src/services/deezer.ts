/**
 * Deezer API Integration
 *
 * Deezer provides a free, easy-to-use API with:
 * - Artist info, albums, top tracks
 * - Album track listings
 * - Search functionality
 * - User data (with OAuth)
 *
 * No API key required for basic access!
 * OAuth required for user-specific data.
 *
 * API Docs: https://developers.deezer.com/api
 */

import type { MusicGraph, MusicEntity, Relationship } from '../types/music'

const BASE_URL = 'https://api.deezer.com'

// For OAuth (optional, for user data)
const config = {
  appId: 'YOUR_DEEZER_APP_ID', // Get one at https://developers.deezer.com/myapps
  redirectUri: window.location.origin + '/deezer-callback',
  permissions: 'basic_access,email,listening_history',
}

interface DeezerArtist {
  id: number
  name: string
  picture: string
  picture_small: string
  picture_medium: string
  picture_big: string
  picture_xl: string
  nb_album?: number
  nb_fan?: number
}

interface DeezerTrack {
  id: number
  title: string
  duration: number
  preview: string
  artist: DeezerArtist
  album: {
    id: number
    title: string
    cover: string
    cover_small: string
    cover_medium: string
    cover_big: string
    cover_xl: string
  }
  contributors?: DeezerArtist[]
}

interface DeezerAlbum {
  id: number
  title: string
  cover: string
  cover_small: string
  cover_medium: string
  cover_big: string
  cover_xl: string
  artist: DeezerArtist
  nb_tracks?: number
  tracks?: { data: DeezerTrack[] }
}

// Token management for OAuth
let accessToken: string | null = null

async function fetchDeezer<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`)

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  if (accessToken) {
    url.searchParams.set('access_token', accessToken)
  }

  // Deezer requires JSONP or CORS proxy for browser requests
  // Using a CORS proxy for demo purposes
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url.toString())}`

  const response = await fetch(proxyUrl)

  if (!response.ok) {
    throw new Error(`Deezer API error: ${response.status}`)
  }

  const data = await response.json()

  if (data.error) {
    throw new Error(`Deezer API error: ${data.error.message}`)
  }

  return data
}

/**
 * Get OAuth URL for user authorization
 */
export function getAuthUrl(): string {
  const params = new URLSearchParams({
    app_id: config.appId,
    redirect_uri: config.redirectUri,
    perms: config.permissions,
  })

  return `https://connect.deezer.com/oauth/auth.php?${params.toString()}`
}

/**
 * Handle OAuth callback
 */
export function handleCallback(): boolean {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')

  if (code) {
    // In production, exchange code for token on your server
    console.log('OAuth code received:', code)
    window.history.replaceState({}, document.title, window.location.pathname)
    return true
  }

  return false
}

/**
 * Set access token (after server-side token exchange)
 */
export function setAccessToken(token: string): void {
  accessToken = token
}

/**
 * Check if authenticated
 */
export function isAuthenticated(): boolean {
  return accessToken !== null
}

/**
 * Search for artists
 */
export async function searchArtist(query: string, limit = 10): Promise<DeezerArtist[]> {
  try {
    const data = await fetchDeezer<{ data: DeezerArtist[] }>('/search/artist', {
      q: query,
      limit: limit.toString(),
    })
    return data.data || []
  } catch (e) {
    console.error('Failed to search artists:', e)
    return []
  }
}

/**
 * Search for tracks
 */
export async function searchTrack(query: string, limit = 10): Promise<DeezerTrack[]> {
  try {
    const data = await fetchDeezer<{ data: DeezerTrack[] }>('/search/track', {
      q: query,
      limit: limit.toString(),
    })
    return data.data || []
  } catch (e) {
    console.error('Failed to search tracks:', e)
    return []
  }
}

/**
 * Search for albums
 */
export async function searchAlbum(query: string, limit = 10): Promise<DeezerAlbum[]> {
  try {
    const data = await fetchDeezer<{ data: DeezerAlbum[] }>('/search/album', {
      q: query,
      limit: limit.toString(),
    })
    return data.data || []
  } catch (e) {
    console.error('Failed to search albums:', e)
    return []
  }
}

/**
 * Get artist by ID
 */
export async function getArtist(artistId: number): Promise<DeezerArtist | null> {
  try {
    return await fetchDeezer<DeezerArtist>(`/artist/${artistId}`)
  } catch (e) {
    console.error('Failed to get artist:', e)
    return null
  }
}

/**
 * Get artist's top tracks
 */
export async function getArtistTopTracks(artistId: number, limit = 10): Promise<DeezerTrack[]> {
  try {
    const data = await fetchDeezer<{ data: DeezerTrack[] }>(`/artist/${artistId}/top`, {
      limit: limit.toString(),
    })
    return data.data || []
  } catch (e) {
    console.error('Failed to get top tracks:', e)
    return []
  }
}

/**
 * Get artist's albums
 */
export async function getArtistAlbums(artistId: number, limit = 10): Promise<DeezerAlbum[]> {
  try {
    const data = await fetchDeezer<{ data: DeezerAlbum[] }>(`/artist/${artistId}/albums`, {
      limit: limit.toString(),
    })
    return data.data || []
  } catch (e) {
    console.error('Failed to get albums:', e)
    return []
  }
}

/**
 * Get related artists
 */
export async function getRelatedArtists(artistId: number, limit = 10): Promise<DeezerArtist[]> {
  try {
    const data = await fetchDeezer<{ data: DeezerArtist[] }>(`/artist/${artistId}/related`, {
      limit: limit.toString(),
    })
    return data.data || []
  } catch (e) {
    console.error('Failed to get related artists:', e)
    return []
  }
}

/**
 * Get album by ID (includes tracks)
 */
export async function getAlbum(albumId: number): Promise<DeezerAlbum | null> {
  try {
    return await fetchDeezer<DeezerAlbum>(`/album/${albumId}`)
  } catch (e) {
    console.error('Failed to get album:', e)
    return null
  }
}

/**
 * Get track by ID
 */
export async function getTrack(trackId: number): Promise<DeezerTrack | null> {
  try {
    return await fetchDeezer<DeezerTrack>(`/track/${trackId}`)
  } catch (e) {
    console.error('Failed to get track:', e)
    return null
  }
}

/**
 * Get chart/top tracks
 */
export async function getChartTracks(limit = 20): Promise<DeezerTrack[]> {
  try {
    const data = await fetchDeezer<{ tracks: { data: DeezerTrack[] } }>('/chart')
    return data.tracks?.data?.slice(0, limit) || []
  } catch (e) {
    console.error('Failed to get chart:', e)
    return []
  }
}

/**
 * Build a graph from an artist search
 */
export async function buildGraphFromArtist(artistName: string): Promise<MusicGraph> {
  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  // Search for artist
  const artists = await searchArtist(artistName, 1)
  if (artists.length === 0) {
    return { entities: [], relationships: [] }
  }

  const mainArtist = artists[0]
  const mainArtistId = `artist-${mainArtist.id}`

  entities.push({
    id: mainArtistId,
    name: mainArtist.name,
    type: 'artist',
    image: mainArtist.picture_medium || mainArtist.picture,
  })
  entityIds.add(mainArtistId)

  // Get related artists
  const related = await getRelatedArtists(mainArtist.id, 6)
  for (const relArtist of related) {
    const relId = `artist-${relArtist.id}`
    if (!entityIds.has(relId)) {
      entities.push({
        id: relId,
        name: relArtist.name,
        type: 'artist',
        image: relArtist.picture_medium || relArtist.picture,
      })
      entityIds.add(relId)

      relationships.push({
        id: `rel-${relationships.length}`,
        source: mainArtistId,
        target: relId,
        role: 'featured',
      })
    }
  }

  // Get top tracks
  const topTracks = await getArtistTopTracks(mainArtist.id, 5)
  for (const track of topTracks) {
    const trackId = `track-${track.id}`
    if (!entityIds.has(trackId)) {
      entities.push({
        id: trackId,
        name: track.title,
        type: 'track',
      })
      entityIds.add(trackId)

      relationships.push({
        id: `rel-${relationships.length}`,
        source: trackId,
        target: mainArtistId,
        role: 'primary_artist',
      })

      // Add contributors/featured artists
      if (track.contributors) {
        for (const contributor of track.contributors) {
          if (contributor.id !== mainArtist.id) {
            const contribId = `artist-${contributor.id}`
            if (!entityIds.has(contribId)) {
              entities.push({
                id: contribId,
                name: contributor.name,
                type: 'artist',
                image: contributor.picture_medium || contributor.picture,
              })
              entityIds.add(contribId)
            }

            relationships.push({
              id: `rel-${relationships.length}`,
              source: trackId,
              target: contribId,
              role: 'featured',
            })
          }
        }
      }

      // Add album
      if (track.album) {
        const albumId = `album-${track.album.id}`
        if (!entityIds.has(albumId)) {
          entities.push({
            id: albumId,
            name: track.album.title,
            type: 'album',
            image: track.album.cover_medium || track.album.cover,
          })
          entityIds.add(albumId)
        }

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
  }

  return { entities, relationships }
}

/**
 * Build a graph from current chart
 */
export async function buildGraphFromChart(): Promise<MusicGraph> {
  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  const chartTracks = await getChartTracks(15)

  for (const track of chartTracks) {
    const trackId = `track-${track.id}`
    const artistId = `artist-${track.artist.id}`

    // Add artist
    if (!entityIds.has(artistId)) {
      entities.push({
        id: artistId,
        name: track.artist.name,
        type: 'artist',
        image: track.artist.picture_medium || track.artist.picture,
      })
      entityIds.add(artistId)
    }

    // Add track
    if (!entityIds.has(trackId)) {
      entities.push({
        id: trackId,
        name: track.title,
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

    // Add album
    if (track.album) {
      const albumId = `album-${track.album.id}`
      if (!entityIds.has(albumId)) {
        entities.push({
          id: albumId,
          name: track.album.title,
          type: 'album',
          image: track.album.cover_medium || track.album.cover,
        })
        entityIds.add(albumId)
      }

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
