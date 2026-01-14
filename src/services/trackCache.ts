/**
 * Track Cache Service
 *
 * Caches MusicBrainz track data to reduce API calls.
 * Uses localStorage for persistence with LRU eviction and TTL expiration.
 */

import type { MusicEntity, Relationship } from '../types/music'

interface CachedTrack {
  entities: MusicEntity[]
  relationships: Relationship[]
  timestamp: number  // When it was cached
  lastAccess: number // For LRU
  hitCount: number   // How many times accessed
}

interface CacheIndex {
  keys: string[]     // Ordered by last access (most recent first)
  version: number    // For cache format migrations
}

const CACHE_PREFIX = 'musicgraph-track-'
const INDEX_KEY = 'musicgraph-track-index'
const CACHE_VERSION = 1
const MAX_CACHE_SIZE = 150        // Maximum tracks to cache
const TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

/**
 * Normalize a string for use as cache key component
 */
function normalizeForKey(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .replace(/\s+/g, '_')     // Replace spaces with underscore
    .trim()
    .slice(0, 50)             // Limit length
}

/**
 * Generate a cache key from track info
 */
export function generateCacheKey(trackName: string, artistName: string, albumName?: string): string {
  const parts = [
    normalizeForKey(artistName),
    normalizeForKey(trackName),
  ]
  if (albumName) {
    parts.push(normalizeForKey(albumName))
  }
  return parts.join('::')
}

/**
 * Get the cache index
 */
function getIndex(): CacheIndex {
  try {
    const data = localStorage.getItem(INDEX_KEY)
    if (data) {
      const index = JSON.parse(data) as CacheIndex
      if (index.version === CACHE_VERSION) {
        return index
      }
      // Version mismatch - clear cache
      console.log('[TrackCache] Version mismatch, clearing cache')
      clearCache()
    }
  } catch (e) {
    console.warn('[TrackCache] Failed to read index:', e)
  }
  return { keys: [], version: CACHE_VERSION }
}

/**
 * Save the cache index
 */
function saveIndex(index: CacheIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch (e) {
    console.warn('[TrackCache] Failed to save index:', e)
  }
}

/**
 * Check if a cached entry has expired
 */
function isExpired(entry: CachedTrack): boolean {
  return Date.now() - entry.timestamp > TTL_MS
}

/**
 * Get a track from the cache
 */
export function getCachedTrack(
  trackName: string,
  artistName: string,
  albumName?: string
): { entities: MusicEntity[]; relationships: Relationship[] } | null {
  const key = generateCacheKey(trackName, artistName, albumName)
  const fullKey = CACHE_PREFIX + key

  try {
    const data = localStorage.getItem(fullKey)
    if (!data) return null

    const entry = JSON.parse(data) as CachedTrack

    // Check expiration
    if (isExpired(entry)) {
      console.log('[TrackCache] Entry expired:', key)
      removeCachedTrack(key)
      return null
    }

    // Update access info
    entry.lastAccess = Date.now()
    entry.hitCount++
    localStorage.setItem(fullKey, JSON.stringify(entry))

    // Move to front of LRU list
    const index = getIndex()
    const keyIndex = index.keys.indexOf(key)
    if (keyIndex > 0) {
      index.keys.splice(keyIndex, 1)
      index.keys.unshift(key)
      saveIndex(index)
    }

    console.log(`[TrackCache] HIT: "${trackName}" by ${artistName} (hits: ${entry.hitCount})`)
    return {
      entities: entry.entities,
      relationships: entry.relationships,
    }
  } catch (e) {
    console.warn('[TrackCache] Failed to read entry:', e)
    return null
  }
}

/**
 * Store a track in the cache
 */
export function setCachedTrack(
  trackName: string,
  artistName: string,
  albumName: string | undefined,
  entities: MusicEntity[],
  relationships: Relationship[]
): void {
  const key = generateCacheKey(trackName, artistName, albumName)
  const fullKey = CACHE_PREFIX + key

  // Don't cache empty results
  if (entities.length === 0) return

  const entry: CachedTrack = {
    entities,
    relationships,
    timestamp: Date.now(),
    lastAccess: Date.now(),
    hitCount: 0,
  }

  try {
    // Update index
    const index = getIndex()

    // Remove if already exists (will re-add at front)
    const existingIndex = index.keys.indexOf(key)
    if (existingIndex >= 0) {
      index.keys.splice(existingIndex, 1)
    }

    // Evict old entries if at capacity
    while (index.keys.length >= MAX_CACHE_SIZE) {
      const oldestKey = index.keys.pop()
      if (oldestKey) {
        localStorage.removeItem(CACHE_PREFIX + oldestKey)
        console.log('[TrackCache] Evicted:', oldestKey)
      }
    }

    // Add new entry at front
    index.keys.unshift(key)
    saveIndex(index)

    // Store the data
    localStorage.setItem(fullKey, JSON.stringify(entry))
    console.log(`[TrackCache] Stored: "${trackName}" by ${artistName} (${entities.length} entities)`)
  } catch (e) {
    // Handle quota exceeded
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('[TrackCache] Storage quota exceeded, evicting old entries')
      evictOldEntries(10)
      // Try again
      try {
        localStorage.setItem(fullKey, JSON.stringify(entry))
      } catch {
        console.error('[TrackCache] Still cannot store after eviction')
      }
    } else {
      console.warn('[TrackCache] Failed to store entry:', e)
    }
  }
}

/**
 * Remove a specific track from the cache
 */
function removeCachedTrack(key: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + key)
    const index = getIndex()
    const keyIndex = index.keys.indexOf(key)
    if (keyIndex >= 0) {
      index.keys.splice(keyIndex, 1)
      saveIndex(index)
    }
  } catch (e) {
    console.warn('[TrackCache] Failed to remove entry:', e)
  }
}

/**
 * Evict the N oldest entries
 */
function evictOldEntries(count: number): void {
  const index = getIndex()
  for (let i = 0; i < count && index.keys.length > 0; i++) {
    const key = index.keys.pop()
    if (key) {
      localStorage.removeItem(CACHE_PREFIX + key)
    }
  }
  saveIndex(index)
}

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  const index = getIndex()
  for (const key of index.keys) {
    localStorage.removeItem(CACHE_PREFIX + key)
  }
  localStorage.removeItem(INDEX_KEY)
  console.log('[TrackCache] Cache cleared')
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  trackCount: number
  oldestEntry: Date | null
  newestEntry: Date | null
  totalHits: number
} {
  const index = getIndex()
  let oldestTimestamp = Infinity
  let newestTimestamp = 0
  let totalHits = 0

  for (const key of index.keys) {
    try {
      const data = localStorage.getItem(CACHE_PREFIX + key)
      if (data) {
        const entry = JSON.parse(data) as CachedTrack
        oldestTimestamp = Math.min(oldestTimestamp, entry.timestamp)
        newestTimestamp = Math.max(newestTimestamp, entry.timestamp)
        totalHits += entry.hitCount
      }
    } catch {
      // Skip invalid entries
    }
  }

  return {
    trackCount: index.keys.length,
    oldestEntry: oldestTimestamp < Infinity ? new Date(oldestTimestamp) : null,
    newestEntry: newestTimestamp > 0 ? new Date(newestTimestamp) : null,
    totalHits,
  }
}

/**
 * Clean up expired entries
 */
export function cleanupExpiredEntries(): number {
  const index = getIndex()
  const keysToRemove: string[] = []

  for (const key of index.keys) {
    try {
      const data = localStorage.getItem(CACHE_PREFIX + key)
      if (data) {
        const entry = JSON.parse(data) as CachedTrack
        if (isExpired(entry)) {
          keysToRemove.push(key)
        }
      } else {
        // Entry missing from storage, remove from index
        keysToRemove.push(key)
      }
    } catch {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    removeCachedTrack(key)
  }

  if (keysToRemove.length > 0) {
    console.log(`[TrackCache] Cleaned up ${keysToRemove.length} expired entries`)
  }

  return keysToRemove.length
}
