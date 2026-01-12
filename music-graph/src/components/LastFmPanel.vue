<script setup lang="ts">
import { ref } from 'vue'
import * as lastfm from '../services/lastfm'
import type { MusicGraph } from '../types/music'
import type { GraphOptions } from '../services/lastfm'

const emit = defineEmits<{
  (e: 'load-graph', graph: MusicGraph): void
  (e: 'close'): void
}>()

const isConfigured = lastfm.isConfigured()
const activeTab = ref<'artist' | 'user'>('artist')
const artistQuery = ref('')
const username = ref('')
const isLoading = ref(false)
const loadingStatus = ref('')
const error = ref<string | null>(null)
const searchResults = ref<Array<{ name: string; image?: string }>>([])
const showOptions = ref(false)

// Graph options
const graphOptions = ref<GraphOptions>({
  topTracks: 20,
  albums: 15,
  tracksPerAlbum: 10,
})

async function searchArtists() {
  if (!artistQuery.value.trim()) return

  isLoading.value = true
  error.value = null

  try {
    const results = await lastfm.searchArtist(artistQuery.value, 6)
    searchResults.value = results.map(a => ({
      name: a.name,
      image: a.image?.find(i => i.size === 'medium')?.['#text']
    }))
  } catch (e) {
    error.value = 'Failed to search artists'
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

async function loadArtist(artistName: string) {
  isLoading.value = true
  loadingStatus.value = 'Fetching artist info...'
  error.value = null

  try {
    const graph = await lastfm.buildGraphFromArtist(artistName, graphOptions.value)
    if (graph.entities.length === 0) {
      error.value = 'No data found for this artist'
    } else {
      emit('load-graph', graph)
      emit('close')
    }
  } catch (e: any) {
    console.error('[Last.fm] Error:', e)
    error.value = e?.message || 'Failed to load artist data'
  } finally {
    isLoading.value = false
    loadingStatus.value = ''
  }
}

async function loadUserHistory() {
  if (!username.value.trim()) return

  isLoading.value = true
  error.value = null

  try {
    const graph = await lastfm.buildGraphFromUserHistory(username.value)
    if (graph.entities.length === 0) {
      error.value = 'No scrobble data found for this user'
    } else {
      emit('load-graph', graph)
      emit('close')
    }
  } catch (e) {
    error.value = 'Failed to load user history'
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

function handleArtistKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    searchArtists()
  }
}

function handleUserKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    loadUserHistory()
  }
}
</script>

<template>
  <div class="lastfm-panel">
    <div class="panel-header">
      <div class="panel-title">
        <span class="lastfm-logo">Last.fm</span>
        <span class="panel-subtitle">Load music data</span>
      </div>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>

    <!-- Not configured warning -->
    <div v-if="!isConfigured" class="config-warning">
      <div class="warning-icon">⚠</div>
      <div class="warning-text">
        <strong>API Key Required</strong>
        <p>Create a <code>.env</code> file with your Last.fm API key:</p>
        <code class="env-example">VITE_LASTFM_API_KEY=your_key_here</code>
        <p class="get-key">
          Get a free key at <a href="https://www.last.fm/api/account/create" target="_blank">last.fm/api</a>
        </p>
      </div>
    </div>

    <template v-else>
      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'artist' }"
          @click="activeTab = 'artist'"
        >
          Search Artist
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'user' }"
          @click="activeTab = 'user'"
        >
          User Scrobbles
        </button>
      </div>

      <!-- Artist search tab -->
      <div v-if="activeTab === 'artist'" class="tab-content">
        <div class="search-row">
          <input
            v-model="artistQuery"
            type="text"
            placeholder="Search for an artist..."
            class="search-input"
            @keydown="handleArtistKeydown"
          />
          <button
            class="search-btn"
            :disabled="isLoading || !artistQuery.trim()"
            @click="searchArtists"
          >
            {{ isLoading ? '...' : 'Search' }}
          </button>
        </div>

        <div v-if="searchResults.length > 0" class="results">
          <button
            v-for="result in searchResults"
            :key="result.name"
            class="result-item"
            :disabled="isLoading"
            @click="loadArtist(result.name)"
          >
            <img
              v-if="result.image"
              :src="result.image"
              class="result-img"
              alt=""
            />
            <div v-else class="result-img placeholder">?</div>
            <span class="result-name">{{ result.name }}</span>
            <span class="result-action">Load</span>
          </button>
        </div>

        <!-- Options toggle -->
        <button class="options-toggle" @click="showOptions = !showOptions">
          <span>{{ showOptions ? '▼' : '▶' }}</span> Options
        </button>

        <div v-if="showOptions" class="options-panel">
          <div class="option-row">
            <label>Top tracks</label>
            <input type="number" v-model.number="graphOptions.topTracks" min="0" max="50" />
          </div>
          <div class="option-row">
            <label>Albums</label>
            <input type="number" v-model.number="graphOptions.albums" min="0" max="50" />
          </div>
          <div class="option-row">
            <label>Tracks per album</label>
            <input type="number" v-model.number="graphOptions.tracksPerAlbum" min="0" max="30" />
          </div>
        </div>

        <div class="hint">
          Loads artist, albums, and tracks with concrete relationships
        </div>
      </div>

      <!-- User history tab -->
      <div v-if="activeTab === 'user'" class="tab-content">
        <div class="search-row">
          <input
            v-model="username"
            type="text"
            placeholder="Enter Last.fm username..."
            class="search-input"
            @keydown="handleUserKeydown"
          />
          <button
            class="search-btn"
            :disabled="isLoading || !username.trim()"
            @click="loadUserHistory"
          >
            {{ isLoading ? '...' : 'Load' }}
          </button>
        </div>

        <div class="hint">
          Loads your recent scrobbles as a graph of artists, tracks, and albums
        </div>
      </div>

      <!-- Error message -->
      <div v-if="error" class="error-msg">
        {{ error }}
      </div>

      <!-- Loading indicator -->
      <div v-if="isLoading" class="loading">
        <div class="spinner"></div>
        <span>{{ loadingStatus || 'Loading from Last.fm...' }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.lastfm-panel {
  background: rgba(15, 15, 26, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 420px;
  max-width: 90vw;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.lastfm-logo {
  font-size: 18px;
  font-weight: 700;
  color: #d51007;
}

.panel-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 18px;
  cursor: pointer;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* Config warning */
.config-warning {
  display: flex;
  gap: 14px;
  padding: 20px;
  background: rgba(213, 16, 7, 0.1);
  border-bottom: 1px solid rgba(213, 16, 7, 0.2);
}

.warning-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.warning-text {
  flex: 1;
}

.warning-text strong {
  display: block;
  margin-bottom: 8px;
  color: #ff6b6b;
}

.warning-text p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.env-example {
  display: block;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: #4ecdc4;
  margin-bottom: 8px;
}

.get-key {
  font-size: 12px;
}

.get-key a {
  color: #d51007;
}

/* Tabs */
.tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tab {
  flex: 1;
  padding: 12px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.03);
}

.tab.active {
  color: #d51007;
  background: rgba(213, 16, 7, 0.1);
  border-bottom: 2px solid #d51007;
}

/* Tab content */
.tab-content {
  padding: 20px;
}

.search-row {
  display: flex;
  gap: 10px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.search-input:focus {
  border-color: rgba(213, 16, 7, 0.5);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.search-btn {
  padding: 10px 18px;
  background: #d51007;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-btn:hover:not(:disabled) {
  background: #e52015;
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Results */
.results {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.result-item:hover:not(:disabled) {
  background: rgba(213, 16, 7, 0.1);
  border-color: rgba(213, 16, 7, 0.2);
}

.result-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result-img {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.1);
}

.result-img.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.3);
}

.result-name {
  flex: 1;
  font-weight: 500;
}

.result-action {
  font-size: 12px;
  color: #d51007;
  padding: 4px 10px;
  background: rgba(213, 16, 7, 0.15);
  border-radius: 4px;
}

/* Options */
.options-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.options-toggle:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
}

.options-panel {
  margin-top: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.option-row:not(:last-child) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.option-row label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.option-row input[type="number"] {
  width: 60px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  text-align: center;
}

.option-row input[type="number"]:focus {
  outline: none;
  border-color: rgba(213, 16, 7, 0.5);
}

/* Hint */
.hint {
  margin-top: 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
}

/* Error */
.error-msg {
  margin: 0 20px 20px;
  padding: 12px;
  background: rgba(255, 107, 107, 0.15);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  color: #ff6b6b;
  font-size: 13px;
  text-align: center;
}

/* Loading */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(213, 16, 7, 0.3);
  border-top-color: #d51007;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
