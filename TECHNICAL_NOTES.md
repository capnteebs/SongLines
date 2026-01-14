# Technical Notes & Issues Solved

This document tracks technical decisions, bugs fixed, and implementation details for the MusicGraph project.

## Table of Contents

- [Data Fetching](#data-fetching)
  - [Recording Lookup Strategy](#recording-lookup-strategy)
  - [Sparse Credits for Popular Tracks](#sparse-credits-for-popular-tracks)
  - [Discogs Matching Anniversary Editions](#discogs-matching-anniversary-editions)
  - [Discogs Credits Debugging](#discogs-credits-debugging)
- [Artist Deduplication](#artist-deduplication)
  - [Duplicate Artist Entries (Punctuation)](#duplicate-artist-entries-eg-jid-vs-jid)
  - [Artist Alias Resolution](#artist-alias-resolution-eg-abel-tesfaye--the-weeknd)
  - [Same Artist Listed Multiple Times](#same-artist-listed-multiple-times-calvin-harris---rollin)
  - [Duplicate Songwriter Entries](#duplicate-songwriter-entries)
- [Images](#images)
  - [Artist Images Not Showing on Graph Nodes](#artist-images-not-showing-on-graph-nodes)
  - [Artist Image Fallback Chain & Caching](#artist-image-fallback-chain--caching)
  - [Track Image Should Use Single Artwork](#track-image-should-use-single-artwork)
- [Role Mapping](#role-mapping)
  - [MusicBrainz Instrument Relations Not Mapping](#musicbrainz-instrument-relations-not-mapping)
  - [Role Types Expanded](#role-types-expanded)

---

## Data Fetching

### Recording Lookup Strategy

**Problem**: MusicBrainz has multiple recordings of the same track (studio, live, remixes). Searching for "Smooth Criminal" might return a live bootleg instead of the studio version with full production credits.

**Solution**: When album name is provided, use release-based lookup:
1. Search for the release (album) first
2. Get the track list from that specific release
3. Use the exact recording ID linked to that release

This ensures we get the recording with production credits (e.g., Quincy Jones on "Smooth Criminal" from "Bad").

**Code**: `findRecordingViaRelease()` in `src/services/musicbrainz.ts`

---

### Sparse Credits for Popular Tracks

**Problem**: "Smooth Criminal" only showed primary artist and songwriter, missing Quincy Jones, Bruce Swedien, etc.

**Cause**: MusicBrainz search returned wrong recording version (one without credits).

**Solution**: Release-based recording lookup (see above).

---

### Discogs Matching Anniversary Editions

**Problem**: Discogs matched "Bad 25" instead of original "Bad" album.

**Solution**: Added scoring penalties for anniversary editions (25, 30, 40, 50), deluxe, special, remaster editions in `findBestRelease()`.

**Code**: `src/services/discogs.ts`

---

### Discogs Credits Debugging

**Problem**: Some tracks show Discogs credits on the website but not in the app.

**Cause**: Could be track name mismatch, wrong release selected, or credits at release-level vs track-level.

**Solution**: Added comprehensive logging to debug Discogs credit fetching:
- Logs full tracklist from matched release
- Shows which tracks have credits attached
- Reports track matching success/failure
- Lists all release-level credits with track assignments

Console output helps diagnose issues:
```
[Discogs] Release "Album" has 12 tracks:
  1. "Track One"
  2. "Here I Am" (3 credits)
[Discogs] Matched track: "Here I Am" (position: 2)
[Discogs] Processing 5 release-level credits:
  1. Producer Name: Producer [all tracks]
  2. Engineer Name: Mixed By [tracks: 1, 2]
```

---

## Artist Deduplication

### Duplicate Artist Entries (e.g., "JID" vs "J.I.D.")

**Problem**: Same artist appearing multiple times with slight name variations.

**Cause**: MusicBrainz may credit the artist differently in different places, or Discogs adds them with different spelling.

**Solution**: Added `normalizeArtistName()` function that strips punctuation for comparison:
- "J.I.D." → "jid"
- "A$AP Rocky" → "asap rocky"

Deduplication checks both MusicBrainz ID and normalized name.

**Code**: `normalizeArtistName()` in `src/services/musicbrainz.ts`

---

### Artist Alias Resolution (e.g., "Abel Tesfaye" → "The Weeknd")

**Problem**: Same artist credited under different names - stage name vs legal name, or different variations.

Examples:
- "The Weeknd" (performer) vs "Abel Tesfaye" (songwriter)
- "Jay-Z" vs "Shawn Carter"
- "Pharrell Williams" vs "Pharrell"

**Cause**: MusicBrainz credits the legal name for songwriting/composing roles while using the stage name for performing credits.

**Solution**: Implemented an alias resolution system:

1. **Fetch aliases**: When a primary artist is added, fetch their aliases from MusicBrainz
2. **Build alias map**: Map all known aliases (normalized) → canonical MBID
3. **Resolve on add**: When adding personnel/songwriter credits, check if the name is an alias of an existing artist
4. **Cross-source dedup**: Also works for Discogs credits that match MusicBrainz artists

```typescript
// Console output when alias is resolved:
[Alias] Found 5 aliases for "The Weeknd":
  - "Abel Tesfaye" → c8b03190-306c-4f38-9235-9e5a0e0c3113
  - "Abel Makkonen Tesfaye" → c8b03190-306c-4f38-9235-9e5a0e0c3113
...
[MusicBrainz] Alias match: "Abel Tesfaye" → "The Weeknd" (work relation)
```

**Deduplication Layers:**

| Layer | Example | Method |
|-------|---------|--------|
| 1. MBID Match | Same artist from different credits | Direct ID comparison |
| 2. Name Normalization | "J.I.D." vs "JID" | Strip punctuation, compare |
| 3. Alias Resolution | "Abel Tesfaye" vs "The Weeknd" | MusicBrainz aliases lookup |

**Cache Utilities:**
```typescript
import { clearAliasCache } from './services/musicbrainz'

// Clear alias cache (for debugging)
clearAliasCache()
```

**Code**: `fetchArtistAliases()`, `resolveArtistAlias()` in `src/services/musicbrainz.ts`

---

### Same Artist Listed Multiple Times (Calvin Harris - Rollin)

**Problem**: Calvin Harris appeared 8 times under "Featured".

**Cause**:
1. Instrument relations were falling through to 'featured' default
2. Relationship IDs used raw MusicBrainz type instead of mapped role

**Solution**:
1. Expanded role mappings for instruments
2. Fixed deduplication to use mapped role in relationship IDs
3. Added attribute checking for MusicBrainz "instrument" type

---

### Duplicate Songwriter Entries

**Problem**: Michael Jackson appearing twice as songwriter.

**Cause**: Artist credited as both "composer" and "lyricist" on the work, but both mapped to "songwriter".

**Solution**: Map composer/lyricist to separate roles. Use mapped role in relationship ID for deduplication.

---

## Images

### Artist Images Not Showing on Graph Nodes

**Problem**: Artist pictures appeared in the side panel but not on graph nodes.

**Cause**: TheAudioDB's CDN blocks CORS requests, preventing Cytoscape.js (canvas-based) from rendering images. Last.fm deprecated artist images.

**Solution**: Use CORS proxies (corsproxy.io, allorigins.win) to fetch images and convert them to base64 data URLs.

**Code**: `toDataURL()` in `src/services/theaudiodb.ts` and `src/services/discogs.ts`

---

### Artist Image Fallback Chain & Caching

**Problem**: Some artists don't have images in TheAudioDB, leaving nodes without pictures. Additionally, the same artist appearing multiple times caused redundant API calls.

**Solution**: Implemented a multi-source fallback chain with multi-level caching:

**Fallback Chain:**
1. **TheAudioDB** (primary) - Uses CORS proxy for canvas compatibility
2. **Discogs** (backup) - Has good coverage for lesser-known artists
3. **Last.fm** (fallback) - Deprecated but sometimes still works

**Caching Layers:**

1. **High-level cache** (`musicbrainz.ts`) - Caches by normalized artist/album name
   - Avoids redundant API calls when same artist appears multiple times
   - Stores `null` for "not found" to avoid re-fetching failures
   - Shared between properties panel and Cytoscape nodes

2. **CORS proxy cache** (`theaudiodb.ts`, `discogs.ts`) - Caches converted data URLs
   - Stores base64 data URLs after successful CORS proxy conversion
   - Avoids re-converting the same image URL

**CORS Proxy Strategy:**
- Images from TheAudioDB and Discogs don't support CORS headers
- Canvas-based rendering (Cytoscape) requires CORS-compatible images
- Multiple CORS proxies tried in order: corsproxy.io, allorigins.win, codetabs.com, proxy.cors.sh
- 8-second timeout per proxy to fail fast
- If all proxies fail, returns `undefined` (no fallback to raw URLs that would break canvas)

**Cache Utilities:**
```typescript
import { clearImageCache, getImageCacheStats } from './services/musicbrainz'

// Clear all cached images (force refresh)
clearImageCache()

// Get cache statistics
const stats = getImageCacheStats()
// { artists: 15, albums: 3, hits: 12 }
```

---

### Track Image Should Use Single Artwork

**Problem**: Track always used album artwork, even when released as a single with different cover.

**Solution**: Check if recording has a Single release. If so, fetch that single's artwork. Fall back to album art if no single exists.

**Code**: Single detection in `buildGraphFromTrack()` in `src/services/musicbrainz.ts`

---

## Role Mapping

### MusicBrainz Instrument Relations Not Mapping

**Problem**: Instruments showing as "other_instrument" instead of specific types.

**Cause**: MusicBrainz uses `type: "instrument"` with actual instrument in `attributes` array.

**Solution**: Updated `mapMBRelationType()` to check attributes when type is "instrument" or "performer".

**Code**: `mapMBRelationType()` in `src/services/musicbrainz.ts`

---

### Role Types Expanded

Added 45+ role types covering:

| Category | Roles |
|----------|-------|
| **Production** | producer, executive_producer, co_producer, vocal_producer, additional_producer |
| **Songwriting** | songwriter, composer, lyricist, arranger |
| **Engineering** | engineer, mixing, mastering, recording, programming |
| **Vocals** | vocals, background_vocals, choir |
| **Strings** | guitar, bass, violin, cello, strings |
| **Rhythm** | drums, percussion |
| **Keys** | keyboards, piano, organ, synthesizer |
| **Brass & Woodwinds** | saxophone, trumpet, horns, flute, woodwinds |
| **Other** | harmonica, turntables, other_instrument |

**Code**: `RoleType` in `src/types/music.ts`, `roleColors` in `src/components/MusicGraph.vue`
