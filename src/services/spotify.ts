/**
 * Spotify Web API Integration
 *
 * To use this service:
 * 1. Create a Spotify Developer app at https://developer.spotify.com/dashboard
 * 2. Set your redirect URI (e.g., http://localhost:5173/callback)
 * 3. Copy your Client ID and set it in the config below
 *
 * This uses the Implicit Grant Flow for client-side apps.
 */

import type { MusicGraph, MusicEntity, Relationship, RoleType } from '../types/music'

// Configuration - Replace with your Spotify app credentials
const config = {
  clientId: 'YOUR_SPOTIFY_CLIENT_ID', // Replace with your Client ID
  redirectUri: window.location.origin + '/callback',
  scopes: [
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-read-recently-played',
    'user-library-read',
  ],
}

// Types for Spotify API responses
interface SpotifyArtist {
  id: string
  name: string
  images: Array<{ url: string; height: number; width: number }>
  genres: string[]
}

interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtist[]
  album: {
    id: string
    name: string
    images: Array<{ url: string; height: number; width: number }>
  }
  duration_ms: number
}

interface SpotifyPlaybackState {
  is_playing: boolean
  progress_ms: number
  item: SpotifyTrack | null
}

// Token management
let accessToken: string | null = null
let tokenExpiry: number | null = null

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'token',
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    show_dialog: 'true',
  })

  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export function handleCallback(): boolean {
  const hash = window.location.hash.substring(1)
  const params = new URLSearchParams(hash)

  const token = params.get('access_token')
  const expiresIn = params.get('expires_in')

  if (token && expiresIn) {
    accessToken = token
    tokenExpiry = Date.now() + parseInt(expiresIn) * 1000

    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname)
    return true
  }

  return false
}

export function isAuthenticated(): boolean {
  return accessToken !== null && tokenExpiry !== null && Date.now() < tokenExpiry
}

export function logout(): void {
  accessToken = null
  tokenExpiry = null
}

async function fetchSpotify<T>(endpoint: string): Promise<T> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated with Spotify')
  }

  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      logout()
      throw new Error('Spotify session expired')
    }
    throw new Error(`Spotify API error: ${response.status}`)
  }

  return response.json()
}

export async function getCurrentlyPlaying(): Promise<SpotifyPlaybackState | null> {
  try {
    return await fetchSpotify<SpotifyPlaybackState>('/me/player/currently-playing')
  } catch (e) {
    console.error('Failed to get currently playing:', e)
    return null
  }
}

export async function getRecentlyPlayed(limit = 20): Promise<SpotifyTrack[]> {
  try {
    const data = await fetchSpotify<{ items: Array<{ track: SpotifyTrack }> }>(
      `/me/player/recently-played?limit=${limit}`
    )
    return data.items.map(item => item.track)
  } catch (e) {
    console.error('Failed to get recently played:', e)
    return []
  }
}

export async function getArtist(artistId: string): Promise<SpotifyArtist | null> {
  try {
    return await fetchSpotify<SpotifyArtist>(`/artists/${artistId}`)
  } catch (e) {
    console.error('Failed to get artist:', e)
    return null
  }
}

export async function getArtistTopTracks(artistId: string, market = 'US'): Promise<SpotifyTrack[]> {
  try {
    const data = await fetchSpotify<{ tracks: SpotifyTrack[] }>(
      `/artists/${artistId}/top-tracks?market=${market}`
    )
    return data.tracks
  } catch (e) {
    console.error('Failed to get artist top tracks:', e)
    return []
  }
}

export async function getRelatedArtists(artistId: string): Promise<SpotifyArtist[]> {
  try {
    const data = await fetchSpotify<{ artists: SpotifyArtist[] }>(
      `/artists/${artistId}/related-artists`
    )
    return data.artists
  } catch (e) {
    console.error('Failed to get related artists:', e)
    return []
  }
}

/**
 * Build a graph from a Spotify track
 */
export async function buildGraphFromTrack(track: SpotifyTrack): Promise<MusicGraph> {
  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  // Add the track
  const trackId = `track-${track.id}`
  entities.push({
    id: trackId,
    name: track.name,
    type: 'track',
  })
  entityIds.add(trackId)

  // Add the album
  const albumId = `album-${track.album.id}`
  entities.push({
    id: albumId,
    name: track.album.name,
    type: 'album',
    image: track.album.images[0]?.url,
  })
  entityIds.add(albumId)

  relationships.push({
    id: `rel-${relationships.length}`,
    source: albumId,
    target: trackId,
    role: 'contains',
  })

  // Add artists
  for (let i = 0; i < track.artists.length; i++) {
    const artist = track.artists[i]
    const artistId = `artist-${artist.id}`

    if (!entityIds.has(artistId)) {
      const fullArtist = await getArtist(artist.id)
      entities.push({
        id: artistId,
        name: artist.name,
        type: 'artist',
        image: fullArtist?.images[0]?.url,
      })
      entityIds.add(artistId)
    }

    relationships.push({
      id: `rel-${relationships.length}`,
      source: trackId,
      target: artistId,
      role: i === 0 ? 'primary_artist' : 'featured',
    })

    // Get related artists for the primary artist
    if (i === 0) {
      const related = await getRelatedArtists(artist.id)
      for (const relatedArtist of related.slice(0, 5)) {
        const relatedId = `artist-${relatedArtist.id}`
        if (!entityIds.has(relatedId)) {
          entities.push({
            id: relatedId,
            name: relatedArtist.name,
            type: 'artist',
            image: relatedArtist.images[0]?.url,
          })
          entityIds.add(relatedId)

          // Create a weak "similar to" relationship
          relationships.push({
            id: `rel-${relationships.length}`,
            source: artistId,
            target: relatedId,
            role: 'featured', // Using 'featured' as a generic connection
          })
        }
      }
    }
  }

  return { entities, relationships }
}

/**
 * Build a graph from currently playing track
 */
export async function buildGraphFromCurrentlyPlaying(): Promise<MusicGraph | null> {
  const playback = await getCurrentlyPlaying()
  if (!playback?.item) {
    return null
  }

  return buildGraphFromTrack(playback.item)
}

/**
 * Build a graph from recently played tracks
 */
export async function buildGraphFromRecentlyPlayed(): Promise<MusicGraph> {
  const tracks = await getRecentlyPlayed(10)

  const allEntities: MusicEntity[] = []
  const allRelationships: Relationship[] = []
  const entityIds = new Set<string>()

  for (const track of tracks) {
    const graph = await buildGraphFromTrack(track)

    for (const entity of graph.entities) {
      if (!entityIds.has(entity.id)) {
        allEntities.push(entity)
        entityIds.add(entity.id)
      }
    }

    for (const rel of graph.relationships) {
      const relKey = `${rel.source}-${rel.target}-${rel.role}`
      if (!entityIds.has(relKey)) {
        allRelationships.push({
          ...rel,
          id: `rel-${allRelationships.length}`,
        })
        entityIds.add(relKey)
      }
    }
  }

  return { entities: allEntities, relationships: allRelationships }
}
