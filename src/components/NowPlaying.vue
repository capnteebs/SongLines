<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { MusicGraph, MusicEntity } from '../types/music'
import * as lastfm from '../services/lastfm'
import type { NowPlayingTrack } from '../services/lastfm'
import { getCachedTrack, generateCacheKey } from '../services/trackCache'

const props = defineProps<{
  graph: MusicGraph
  lastfmUsername?: string
}>()

const emit = defineEmits<{
  (e: 'viewInGraph', trackId: string): void
  (e: 'updateUsername', username: string): void
  (e: 'trackChange', data: { artist: string; track: string; album: string }): void
}>()

// Polling intervals
const NORMAL_POLL_INTERVAL = 12000   // 12 seconds normally
const FAST_POLL_INTERVAL = 4000      // 4 seconds when pending

// Last.fm state
const lastfmTrack = ref<NowPlayingTrack | null>(null)      // Raw data from API (for comparison)
const stableTrack = ref<NowPlayingTrack | null>(null)      // Confirmed track (for UI display)
const pendingTrack = ref<NowPlayingTrack | null>(null)     // Track waiting for confirmation
const previousStableTrack = ref<NowPlayingTrack | null>(null) // Previous track for quick return
const lastfmError = ref<string | null>(null)
const isConnected = ref(false)
const showUsernameInput = ref(false)
const usernameInput = ref('')
const autoSyncGraph = ref(true)

// Check if a track is in the cache
function isTrackCached(track: NowPlayingTrack): boolean {
  const key = generateCacheKey(track.track, track.artist, track.album)
  const cached = getCachedTrack(track.track, track.artist, track.album)
  return cached !== null
}

// Fallback to graph tracks when no Last.fm
const tracks = computed(() =>
  props.graph.entities.filter(e => e.type === 'track')
)

const currentTrackIndex = ref(0)
const isPlaying = ref(true)
const progress = ref(0)
const duration = 210 // 3:30 in seconds

let progressInterval: number | null = null
let lastfmPollInterval: number | null = null

// Use stable (debounced) Last.fm track if available, otherwise use graph track
const currentTrack = computed(() => {
  if (stableTrack.value) {
    return {
      name: stableTrack.value.track,
      artist: stableTrack.value.artist,
      album: stableTrack.value.album,
      image: stableTrack.value.image,
      isLastFm: true,
      isPlaying: stableTrack.value.isPlaying,
    }
  }

  const track = tracks.value[currentTrackIndex.value]
  if (!track) return null

  // Get artist names from graph
  const artistIds = new Set<string>()
  for (const rel of props.graph.relationships) {
    if (rel.source === track.id &&
        (rel.role === 'primary_artist' || rel.role === 'featured')) {
      artistIds.add(rel.target)
    }
  }
  const artists = props.graph.entities.filter(e => artistIds.has(e.id))

  // Get album from graph
  let album: MusicEntity | undefined
  for (const rel of props.graph.relationships) {
    if (rel.target === track.id && rel.role === 'contains') {
      album = props.graph.entities.find(e => e.id === rel.source)
      break
    }
  }

  return {
    id: track.id,
    name: track.name,
    artist: artists.map(a => a.name).join(', '),
    album: album?.name || '',
    image: track.image,
    isLastFm: false,
    isPlaying: isPlaying.value,
  }
})

const progressPercent = computed(() => (progress.value / duration) * 100)

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Last.fm polling
async function pollLastFm() {
  if (!props.lastfmUsername) {
    lastfmTrack.value = null
    isConnected.value = false
    return
  }

  try {
    const track = await lastfm.getNowPlaying(props.lastfmUsername)
    lastfmTrack.value = track
    lastfmError.value = null
    isConnected.value = true
  } catch (e: any) {
    lastfmError.value = e.message || 'Failed to connect to Last.fm'
    isConnected.value = false
  }
}

let currentPollInterval = NORMAL_POLL_INTERVAL

function startLastFmPolling(interval = NORMAL_POLL_INTERVAL, pollImmediately = true) {
  if (lastfmPollInterval) return

  currentPollInterval = interval

  // Poll immediately only on initial start
  if (pollImmediately) {
    pollLastFm()
  }

  // Start polling at the specified interval
  lastfmPollInterval = window.setInterval(pollLastFm, interval)
}

function stopLastFmPolling() {
  if (lastfmPollInterval) {
    clearInterval(lastfmPollInterval)
    lastfmPollInterval = null
  }
}

// Switch to fast polling when we have a pending track
// Don't poll immediately - wait for the next interval
function switchToFastPolling() {
  if (currentPollInterval === FAST_POLL_INTERVAL) return
  console.log('[NowPlaying] Switching to fast polling (4s)')
  stopLastFmPolling()
  startLastFmPolling(FAST_POLL_INTERVAL, false) // Don't poll immediately!
}

// Switch back to normal polling
function switchToNormalPolling() {
  if (currentPollInterval === NORMAL_POLL_INTERVAL) return
  console.log('[NowPlaying] Switching to normal polling (12s)')
  stopLastFmPolling()
  startLastFmPolling(NORMAL_POLL_INTERVAL, false) // Don't poll immediately!
}

// Fallback progress simulation
function startProgress() {
  if (progressInterval) return

  progressInterval = window.setInterval(() => {
    if (isPlaying.value && !lastfmTrack.value) {
      progress.value += 1
      if (progress.value >= duration) {
        nextTrack()
      }
    }
  }, 1000)
}

function stopProgress() {
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
}

function togglePlay() {
  isPlaying.value = !isPlaying.value
}

function nextTrack() {
  currentTrackIndex.value = (currentTrackIndex.value + 1) % tracks.value.length
  progress.value = 0
}

function prevTrack() {
  if (progress.value > 3) {
    progress.value = 0
  } else {
    currentTrackIndex.value = (currentTrackIndex.value - 1 + tracks.value.length) % tracks.value.length
    progress.value = 0
  }
}

function handleViewInGraph() {
  if (currentTrack.value && !currentTrack.value.isLastFm && 'id' in currentTrack.value) {
    emit('viewInGraph', (currentTrack.value as any).id)
  }
}

function handleProgressClick(event: MouseEvent) {
  if (lastfmTrack.value) return // Can't seek Last.fm tracks
  const bar = event.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  progress.value = Math.floor(percent * duration)
}

function handleSetUsername() {
  const username = usernameInput.value.trim()
  if (username) {
    emit('updateUsername', username)
    showUsernameInput.value = false
  }
}

function handleDisconnect() {
  emit('updateUsername', '')
  lastfmTrack.value = null
  isConnected.value = false
}

// Watch for username changes
watch(() => props.lastfmUsername, (newUsername) => {
  if (newUsername) {
    usernameInput.value = newUsername
    startLastFmPolling()
  } else {
    stopLastFmPolling()
    lastfmTrack.value = null
    isConnected.value = false
  }
}, { immediate: true })

// Helper to check if two tracks are the same
function isSameTrack(a: NowPlayingTrack | null, b: NowPlayingTrack | null): boolean {
  if (!a || !b) return false
  return a.artist === b.artist && a.track === b.track
}

// Helper to confirm a track (update UI + trigger search)
function confirmTrack(track: NowPlayingTrack, reason: string) {
  console.log(`[NowPlaying] Track confirmed (${reason}):`, track.track)

  // Save current stable as previous before replacing
  if (stableTrack.value && !isSameTrack(stableTrack.value, track)) {
    previousStableTrack.value = stableTrack.value
  }

  stableTrack.value = track
  pendingTrack.value = null

  // Switch back to normal polling
  switchToNormalPolling()

  if (autoSyncGraph.value) {
    emit('trackChange', {
      artist: track.artist,
      track: track.track,
      album: track.album,
    })
  }
}

// Watch for track changes with smart confirmation
watch(lastfmTrack, (newTrack) => {
  if (!newTrack) {
    // Disconnected - clear everything
    stableTrack.value = null
    pendingTrack.value = null
    previousStableTrack.value = null
    switchToNormalPolling()
    return
  }

  // First track after connecting - show immediately
  if (!stableTrack.value && !pendingTrack.value) {
    confirmTrack(newTrack, 'first track')
    return
  }

  // Check if this is the same as the current stable track
  if (isSameTrack(newTrack, stableTrack.value)) {
    // Same track, clear any pending and update play status
    pendingTrack.value = null
    switchToNormalPolling()
    if (stableTrack.value && newTrack.isPlaying !== stableTrack.value.isPlaying) {
      stableTrack.value = { ...stableTrack.value, isPlaying: newTrack.isPlaying }
    }
    return
  }

  // IMPROVEMENT #4: Instant return to previous track
  if (isSameTrack(newTrack, previousStableTrack.value)) {
    confirmTrack(newTrack, 'return to previous')
    return
  }

  // IMPROVEMENT #1: Instant confirmation for cached tracks
  if (isTrackCached(newTrack)) {
    confirmTrack(newTrack, 'cached')
    return
  }

  // Different track - check if it matches pending
  if (isSameTrack(newTrack, pendingTrack.value)) {
    // Same as pending - this is the 2nd consecutive poll, confirm it!
    confirmTrack(newTrack, '2 consecutive polls')
  } else {
    // New track, different from both stable and pending - set as pending
    console.log('[NowPlaying] New track detected, waiting for confirmation:', newTrack.track)
    pendingTrack.value = newTrack

    // IMPROVEMENT #3: Switch to fast polling to confirm quicker
    switchToFastPolling()
  }
})

onMounted(() => {
  // Start at a random position for variety
  progress.value = Math.floor(Math.random() * 60)
  startProgress()

  if (props.lastfmUsername) {
    usernameInput.value = props.lastfmUsername
    startLastFmPolling()
  }
})

onUnmounted(() => {
  stopProgress()
  stopLastFmPolling()
})
</script>

<template>
  <div class="now-playing">
    <div class="np-track-info">
      <div class="np-artwork" :class="{ 'has-image': currentTrack?.image }">
        <img v-if="currentTrack?.image" :src="currentTrack.image" alt="" class="np-artwork-img" />
        <span v-else class="np-artwork-icon">🎵</span>
        <div v-if="currentTrack?.isPlaying" class="np-visualizer">
          <span class="bar"></span>
          <span class="bar"></span>
          <span class="bar"></span>
        </div>
      </div>
      <div class="np-details">
        <div class="np-title">{{ currentTrack?.name || 'No track' }}</div>
        <div class="np-artist">{{ currentTrack?.artist || 'Unknown' }}</div>
        <!-- Pending track indicator -->
        <Transition name="pending-fade">
          <div v-if="pendingTrack" class="np-pending">
            <span class="pending-icon">↻</span>
            <span class="pending-text">{{ pendingTrack.track }}</span>
          </div>
        </Transition>
      </div>
    </div>

    <div class="np-controls">
      <!-- Last.fm mode - no controls, just status -->
      <template v-if="lastfmTrack">
        <div class="np-lastfm-status">
          <span class="lastfm-badge" :class="{ playing: lastfmTrack.isPlaying }">
            <span class="lastfm-icon">♪</span>
            {{ lastfmTrack.isPlaying ? 'Scrobbling now' : 'Last scrobbled' }}
          </span>
        </div>
      </template>

      <!-- Fallback mode - simulated playback -->
      <template v-else>
        <div class="np-buttons">
          <button class="np-btn" @click="prevTrack" title="Previous">
            <span>⏮</span>
          </button>
          <button class="np-btn np-btn-play" @click="togglePlay" :title="isPlaying ? 'Pause' : 'Play'">
            <span>{{ isPlaying ? '⏸' : '▶' }}</span>
          </button>
          <button class="np-btn" @click="nextTrack" title="Next">
            <span>⏭</span>
          </button>
        </div>

        <div class="np-progress-wrapper">
          <span class="np-time">{{ formatTime(progress) }}</span>
          <div class="np-progress-bar" @click="handleProgressClick">
            <div class="np-progress-fill" :style="{ width: progressPercent + '%' }">
              <div class="np-progress-handle"></div>
            </div>
          </div>
          <span class="np-time">{{ formatTime(duration) }}</span>
        </div>
      </template>
    </div>

    <div class="np-actions">
      <div class="np-album" v-if="currentTrack?.album">
        <span class="np-album-label">from</span>
        <span class="np-album-name">{{ currentTrack.album }}</span>
      </div>

      <!-- Last.fm connection status -->
      <div class="np-lastfm-connection">
        <template v-if="isConnected && lastfmUsername">
          <button class="np-lastfm-btn connected" @click="handleDisconnect" title="Disconnect Last.fm">
            <span class="lastfm-dot"></span>
            <span>{{ lastfmUsername }}</span>
          </button>
          <button
            class="np-sync-btn"
            :class="{ active: autoSyncGraph }"
            @click="autoSyncGraph = !autoSyncGraph"
            :title="autoSyncGraph ? 'Auto-sync enabled: Graph updates with playing track' : 'Auto-sync disabled'"
          >
            <span class="sync-icon">{{ autoSyncGraph ? '⟳' : '○' }}</span>
          </button>
        </template>
        <template v-else-if="showUsernameInput">
          <div class="np-username-input">
            <input
              v-model="usernameInput"
              type="text"
              placeholder="Last.fm username"
              @keydown.enter="handleSetUsername"
              @keydown.escape="showUsernameInput = false"
            />
            <button class="np-username-btn" @click="handleSetUsername">Connect</button>
          </div>
        </template>
        <template v-else>
          <button class="np-lastfm-btn" @click="showUsernameInput = true" title="Connect Last.fm">
            <span class="lastfm-icon-btn">♪</span>
            <span>Last.fm</span>
          </button>
        </template>
      </div>

      <button
        v-if="!currentTrack?.isLastFm"
        class="np-view-btn"
        @click="handleViewInGraph"
      >
        <span class="np-view-icon">◉</span>
        <span>View in Graph</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.now-playing {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
  background: linear-gradient(180deg, #12121f 0%, #1a1a2e 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.np-track-info {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 200px;
  max-width: 300px;
}

.np-artwork {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #c44dff 0%, #ff6b9d 100%);
  border-radius: 8px;
  font-size: 20px;
  overflow: hidden;
}

.np-artwork.has-image {
  background: #1a1a2e;
}

.np-artwork-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.np-visualizer {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 16px;
}

.np-visualizer .bar {
  width: 3px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 1px;
  animation: visualizer 0.5s ease-in-out infinite alternate;
}

.np-visualizer .bar:nth-child(1) {
  animation-delay: 0s;
  height: 8px;
}

.np-visualizer .bar:nth-child(2) {
  animation-delay: 0.15s;
  height: 14px;
}

.np-visualizer .bar:nth-child(3) {
  animation-delay: 0.3s;
  height: 10px;
}

@keyframes visualizer {
  from { height: 4px; }
  to { height: 14px; }
}

.np-details {
  flex: 1;
  min-width: 0;
}

.np-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.np-artist {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.np-pending {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 3px 8px;
  background: rgba(78, 205, 196, 0.15);
  border: 1px solid rgba(78, 205, 196, 0.3);
  border-radius: 4px;
  font-size: 10px;
  color: #4ecdc4;
}

.pending-icon {
  animation: spin 1s linear infinite;
}

.pending-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.pending-fade-enter-active,
.pending-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.pending-fade-enter-from,
.pending-fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.np-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 2;
  max-width: 600px;
}

.np-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.np-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.15s ease;
}

.np-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.np-btn-play {
  width: 36px;
  height: 36px;
  background: #ffffff;
  color: #0f0f1a;
  font-size: 14px;
}

.np-btn-play:hover {
  background: #ffffff;
  color: #0f0f1a;
  transform: scale(1.05);
}

.np-progress-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.np-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
  min-width: 36px;
}

.np-time:last-child {
  text-align: right;
}

.np-progress-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}

.np-progress-bar:hover {
  height: 6px;
}

.np-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #c44dff 0%, #ff6b9d 100%);
  border-radius: 2px;
  position: relative;
  transition: width 0.1s linear;
}

.np-progress-handle {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  background: #ffffff;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.np-progress-bar:hover .np-progress-handle {
  opacity: 1;
}

.np-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  justify-content: flex-end;
}

.np-album {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
}

.np-album-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.np-album-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.np-view-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(196, 77, 255, 0.2) 0%, rgba(255, 107, 157, 0.2) 100%);
  border: 1px solid rgba(196, 77, 255, 0.3);
  border-radius: 20px;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.np-view-btn:hover {
  background: linear-gradient(135deg, rgba(196, 77, 255, 0.35) 0%, rgba(255, 107, 157, 0.35) 100%);
  border-color: rgba(196, 77, 255, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(196, 77, 255, 0.25);
}

.np-view-icon {
  font-size: 14px;
  color: #c44dff;
}

/* Last.fm styles */
.np-lastfm-status {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
}

.lastfm-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(213, 16, 7, 0.15);
  border: 1px solid rgba(213, 16, 7, 0.3);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.lastfm-badge.playing {
  background: rgba(213, 16, 7, 0.25);
  border-color: rgba(213, 16, 7, 0.5);
  color: #fff;
}

.lastfm-badge.playing .lastfm-icon {
  animation: pulse 1.5s ease-in-out infinite;
}

.lastfm-icon {
  color: #d51007;
  font-size: 14px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.np-lastfm-connection {
  display: flex;
  align-items: center;
  gap: 6px;
}

.np-sync-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.np-sync-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.np-sync-btn.active {
  background: rgba(76, 175, 80, 0.2);
  border-color: rgba(76, 175, 80, 0.4);
  color: #4CAF50;
}

.np-sync-btn.active:hover {
  background: rgba(76, 175, 80, 0.3);
}

.sync-icon {
  font-size: 14px;
}

.np-lastfm-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(213, 16, 7, 0.1);
  border: 1px solid rgba(213, 16, 7, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.np-lastfm-btn:hover {
  background: rgba(213, 16, 7, 0.2);
  border-color: rgba(213, 16, 7, 0.4);
  color: #fff;
}

.np-lastfm-btn.connected {
  background: rgba(76, 175, 80, 0.15);
  border-color: rgba(76, 175, 80, 0.3);
}

.np-lastfm-btn.connected:hover {
  background: rgba(255, 82, 82, 0.15);
  border-color: rgba(255, 82, 82, 0.3);
}

.lastfm-dot {
  width: 6px;
  height: 6px;
  background: #4CAF50;
  border-radius: 50%;
}

.np-lastfm-btn.connected:hover .lastfm-dot {
  background: #ff5252;
}

.lastfm-icon-btn {
  color: #d51007;
}

.np-username-input {
  display: flex;
  align-items: center;
  gap: 6px;
}

.np-username-input input {
  width: 120px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  outline: none;
}

.np-username-input input:focus {
  border-color: rgba(213, 16, 7, 0.5);
}

.np-username-input input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.np-username-btn {
  padding: 6px 12px;
  background: #d51007;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.np-username-btn:hover {
  background: #e52015;
}
</style>
