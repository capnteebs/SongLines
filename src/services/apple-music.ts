/**
 * Apple Music (MusicKit JS) Integration
 *
 * Apple MusicKit provides access to:
 * - Apple Music catalog (artists, albums, songs, playlists)
 * - User library and playlists (with auth)
 * - Playback control
 * - Search functionality
 *
 * Requirements:
 * 1. Apple Developer Program membership ($99/year)
 * 2. MusicKit identifier configured in App Store Connect
 * 3. Private key for generating JWT tokens
 * 4. Server-side token generation (tokens expire after 6 months max)
 *
 * Setup:
 * 1. Go to https://developer.apple.com/account/resources/authkeys/list
 * 2. Create a MusicKit key and download it
 * 3. Note your Team ID and Key ID
 * 4. Generate a developer token on your server (see generateToken example)
 * 5. Configure MusicKit in your app
 *
 * Docs: https://developer.apple.com/documentation/musickitjs
 */

import type { MusicGraph, MusicEntity, Relationship } from '../types/music'

// Configuration
const config = {
  developerToken: 'YOUR_DEVELOPER_TOKEN', // JWT token from your server
  appName: 'MusicGraph',
  appBuild: '1.0.0',
}

// MusicKit instance
let musicKit: any = null

interface AppleMusicArtist {
  id: string
  type: 'artists'
  attributes: {
    name: string
    genreNames: string[]
    artwork?: { url: string; width: number; height: number }
    url: string
  }
  relationships?: {
    albums?: { data: AppleMusicAlbum[] }
  }
}

interface AppleMusicAlbum {
  id: string
  type: 'albums'
  attributes: {
    name: string
    artistName: string
    artwork?: { url: string; width: number; height: number }
    trackCount: number
    releaseDate: string
    genreNames: string[]
  }
  relationships?: {
    tracks?: { data: AppleMusicSong[] }
    artists?: { data: AppleMusicArtist[] }
  }
}

interface AppleMusicSong {
  id: string
  type: 'songs'
  attributes: {
    name: string
    artistName: string
    albumName: string
    durationInMillis: number
    artwork?: { url: string; width: number; height: number }
    previews?: Array<{ url: string }>
  }
  relationships?: {
    artists?: { data: AppleMusicArtist[] }
    albums?: { data: AppleMusicAlbum[] }
  }
}

interface AppleMusicSearchResults {
  artists?: { data: AppleMusicArtist[] }
  albums?: { data: AppleMusicAlbum[] }
  songs?: { data: AppleMusicSong[] }
}

/**
 * Example of how to generate a developer token (server-side)
 *
 * This should be done on your backend, not in the browser!
 * The token can be valid for up to 6 months.
 *
 * ```javascript
 * const jwt = require('jsonwebtoken');
 * const fs = require('fs');
 *
 * const privateKey = fs.readFileSync('AuthKey_XXXXXXXXXX.p8');
 * const teamId = 'YOUR_TEAM_ID';
 * const keyId = 'YOUR_KEY_ID';
 *
 * const token = jwt.sign({}, privateKey, {
 *   algorithm: 'ES256',
 *   expiresIn: '180d',
 *   issuer: teamId,
 *   header: {
 *     alg: 'ES256',
 *     kid: keyId
 *   }
 * });
 *
 * console.log(token);
 * ```
 */

/**
 * Load MusicKit JS library
 */
export async function loadMusicKit(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('MusicKit can only be loaded in a browser environment')
  }

  // Check if already loaded
  if ((window as any).MusicKit) {
    return
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load MusicKit'))
    document.head.appendChild(script)
  })
}

/**
 * Initialize MusicKit
 */
export async function initializeMusicKit(): Promise<void> {
  await loadMusicKit()

  const MusicKit = (window as any).MusicKit

  await MusicKit.configure({
    developerToken: config.developerToken,
    app: {
      name: config.appName,
      build: config.appBuild,
    },
  })

  musicKit = MusicKit.getInstance()
}

/**
 * Check if MusicKit is initialized
 */
export function isInitialized(): boolean {
  return musicKit !== null
}

/**
 * Authorize user (opens Apple Music login)
 */
export async function authorize(): Promise<string> {
  if (!musicKit) {
    throw new Error('MusicKit not initialized')
  }

  return await musicKit.authorize()
}

/**
 * Check if user is authorized
 */
export function isAuthorized(): boolean {
  return musicKit?.isAuthorized ?? false
}

/**
 * Unauthorize user
 */
export async function unauthorize(): Promise<void> {
  if (musicKit) {
    await musicKit.unauthorize()
  }
}

/**
 * Get artwork URL with size
 */
function getArtworkUrl(artwork?: { url: string }, size = 300): string | undefined {
  if (!artwork?.url) return undefined
  return artwork.url.replace('{w}', size.toString()).replace('{h}', size.toString())
}

/**
 * Search the Apple Music catalog
 */
export async function search(query: string, types: ('artists' | 'albums' | 'songs')[] = ['artists', 'albums', 'songs'], limit = 10): Promise<AppleMusicSearchResults> {
  if (!musicKit) {
    throw new Error('MusicKit not initialized')
  }

  try {
    const results = await musicKit.api.music(`/v1/catalog/us/search`, {
      term: query,
      types: types.join(','),
      limit,
    })

    return results.data.results
  } catch (e) {
    console.error('Failed to search:', e)
    return {}
  }
}

/**
 * Get artist by ID
 */
export async function getArtist(artistId: string, include: string[] = ['albums']): Promise<AppleMusicArtist | null> {
  if (!musicKit) {
    throw new Error('MusicKit not initialized')
  }

  try {
    const result = await musicKit.api.music(`/v1/catalog/us/artists/${artistId}`, {
      include: include.join(','),
    })

    return result.data.data[0]
  } catch (e) {
    console.error('Failed to get artist:', e)
    return null
  }
}

/**
 * Get album by ID
 */
export async function getAlbum(albumId: string, include: string[] = ['tracks', 'artists']): Promise<AppleMusicAlbum | null> {
  if (!musicKit) {
    throw new Error('MusicKit not initialized')
  }

  try {
    const result = await musicKit.api.music(`/v1/catalog/us/albums/${albumId}`, {
      include: include.join(','),
    })

    return result.data.data[0]
  } catch (e) {
    console.error('Failed to get album:', e)
    return null
  }
}

/**
 * Get song by ID
 */
export async function getSong(songId: string, include: string[] = ['artists', 'albums']): Promise<AppleMusicSong | null> {
  if (!musicKit) {
    throw new Error('MusicKit not initialized')
  }

  try {
    const result = await musicKit.api.music(`/v1/catalog/us/songs/${songId}`, {
      include: include.join(','),
    })

    return result.data.data[0]
  } catch (e) {
    console.error('Failed to get song:', e)
    return null
  }
}

/**
 * Get user's recently played (requires auth)
 */
export async function getRecentlyPlayed(limit = 20): Promise<AppleMusicSong[]> {
  if (!musicKit || !isAuthorized()) {
    throw new Error('Not authorized')
  }

  try {
    const result = await musicKit.api.music('/v1/me/recent/played/tracks', {
      limit,
    })

    return result.data.data
  } catch (e) {
    console.error('Failed to get recently played:', e)
    return []
  }
}

/**
 * Get user's library artists (requires auth)
 */
export async function getLibraryArtists(limit = 50): Promise<AppleMusicArtist[]> {
  if (!musicKit || !isAuthorized()) {
    throw new Error('Not authorized')
  }

  try {
    const result = await musicKit.api.music('/v1/me/library/artists', {
      limit,
    })

    return result.data.data
  } catch (e) {
    console.error('Failed to get library artists:', e)
    return []
  }
}

/**
 * Get currently playing (if using MusicKit player)
 */
export function getCurrentlyPlaying(): AppleMusicSong | null {
  if (!musicKit) return null
  return musicKit.player.nowPlayingItem
}

/**
 * Build a graph from an artist search
 */
export async function buildGraphFromArtist(artistName: string): Promise<MusicGraph> {
  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  // Search for artist
  const results = await search(artistName, ['artists'], 1)
  if (!results.artists?.data?.length) {
    return { entities: [], relationships: [] }
  }

  const mainArtist = results.artists.data[0]
  const mainArtistId = `artist-${mainArtist.id}`

  entities.push({
    id: mainArtistId,
    name: mainArtist.attributes.name,
    type: 'artist',
    image: getArtworkUrl(mainArtist.attributes.artwork),
  })
  entityIds.add(mainArtistId)

  // Get full artist with albums
  const fullArtist = await getArtist(mainArtist.id, ['albums'])

  if (fullArtist?.relationships?.albums?.data) {
    for (const album of fullArtist.relationships.albums.data.slice(0, 5)) {
      const albumId = `album-${album.id}`

      if (!entityIds.has(albumId)) {
        entities.push({
          id: albumId,
          name: album.attributes.name,
          type: 'album',
          image: getArtworkUrl(album.attributes.artwork),
        })
        entityIds.add(albumId)

        // Get album tracks
        const fullAlbum = await getAlbum(album.id, ['tracks'])
        if (fullAlbum?.relationships?.tracks?.data) {
          for (const track of fullAlbum.relationships.tracks.data.slice(0, 5)) {
            const trackId = `track-${track.id}`

            if (!entityIds.has(trackId)) {
              entities.push({
                id: trackId,
                name: track.attributes.name,
                type: 'track',
              })
              entityIds.add(trackId)

              // Track -> Artist
              relationships.push({
                id: `rel-${relationships.length}`,
                source: trackId,
                target: mainArtistId,
                role: 'primary_artist',
              })

              // Album -> Track
              relationships.push({
                id: `rel-${relationships.length}`,
                source: albumId,
                target: trackId,
                role: 'contains',
              })
            }
          }
        }
      }
    }
  }

  return { entities, relationships }
}

/**
 * Build a graph from user's recently played (requires auth)
 */
export async function buildGraphFromRecentlyPlayed(): Promise<MusicGraph> {
  const entities: MusicEntity[] = []
  const relationships: Relationship[] = []
  const entityIds = new Set<string>()

  const recentTracks = await getRecentlyPlayed(20)

  for (const track of recentTracks) {
    const trackId = `track-${track.id}`
    const artistName = track.attributes.artistName
    const artistId = `artist-${artistName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

    // Add artist
    if (!entityIds.has(artistId)) {
      entities.push({
        id: artistId,
        name: artistName,
        type: 'artist',
      })
      entityIds.add(artistId)
    }

    // Add track
    if (!entityIds.has(trackId)) {
      entities.push({
        id: trackId,
        name: track.attributes.name,
        type: 'track',
        image: getArtworkUrl(track.attributes.artwork),
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
    if (track.attributes.albumName) {
      const albumId = `album-${track.attributes.albumName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

      if (!entityIds.has(albumId)) {
        entities.push({
          id: albumId,
          name: track.attributes.albumName,
          type: 'album',
          image: getArtworkUrl(track.attributes.artwork),
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
