<script setup lang="ts">
import { ref } from 'vue'
import { searchArtist } from '../services/musicbrainz'

const emit = defineEmits<{
  (e: 'load-artist', artistName: string): void
  (e: 'close'): void
}>()

interface SearchResult {
  id: string
  name: string
  type?: string
  country?: string
}

const artistQuery = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)
const searchResults = ref<SearchResult[]>([])

async function searchArtists() {
  if (!artistQuery.value.trim()) return

  isLoading.value = true
  error.value = null

  try {
    const results = await searchArtist(artistQuery.value)
    searchResults.value = results.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      country: a.country,
    }))
  } catch (e: any) {
    error.value = e?.message || 'Failed to search artists'
    console.error('[MusicBrainz] Search error:', e)
  } finally {
    isLoading.value = false
  }
}

function selectArtist(artist: SearchResult) {
  emit('load-artist', artist.name)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    searchArtists()
  }
}
</script>

<template>
  <div class="musicbrainz-panel">
    <div class="panel-header">
      <div class="panel-title">
        <span class="mb-logo">MusicBrainz</span>
        <span class="panel-subtitle">Drill-down navigation</span>
      </div>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>

    <div class="panel-content">
      <div class="info-box">
        <div class="info-icon">◎</div>
        <div class="info-text">
          <strong>How it works</strong>
          <p>Search for an artist to load their discography. Double-click releases to see tracks, then tracks to see personnel credits.</p>
        </div>
      </div>

      <div class="search-row">
        <input
          v-model="artistQuery"
          type="text"
          placeholder="Search for an artist..."
          class="search-input"
          @keydown="handleKeydown"
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
          :key="result.id"
          class="result-item"
          :disabled="isLoading"
          @click="selectArtist(result)"
        >
          <div class="result-icon">👤</div>
          <div class="result-info">
            <span class="result-name">{{ result.name }}</span>
            <span v-if="result.type || result.country" class="result-meta">
              {{ [result.type, result.country].filter(Boolean).join(' • ') }}
            </span>
          </div>
          <span class="result-action">Load</span>
        </button>
      </div>

      <div v-if="error" class="error-msg">
        {{ error }}
      </div>

      <div class="hints">
        <div class="hint-title">Navigation</div>
        <div class="hint-item">
          <span class="hint-icon">🖱️</span>
          <span>Double-click nodes to expand/collapse</span>
        </div>
        <div class="hint-item">
          <span class="hint-icon">←</span>
          <span>Use Back button to collapse current level</span>
        </div>
        <div class="hint-item">
          <span class="hint-icon">⚡</span>
          <span>Siblings hide when you drill down</span>
        </div>
      </div>

      <div class="rate-limit-note">
        Note: MusicBrainz API is rate-limited to 1 request/second
      </div>
    </div>
  </div>
</template>

<style scoped>
.musicbrainz-panel {
  background: rgba(15, 15, 26, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 420px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
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

.mb-logo {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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

.panel-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.info-box {
  display: flex;
  gap: 14px;
  padding: 14px;
  background: rgba(196, 77, 255, 0.1);
  border: 1px solid rgba(196, 77, 255, 0.2);
  border-radius: 10px;
  margin-bottom: 20px;
}

.info-icon {
  font-size: 24px;
  color: #c44dff;
  flex-shrink: 0;
}

.info-text {
  flex: 1;
}

.info-text strong {
  display: block;
  margin-bottom: 4px;
  color: #fff;
  font-size: 13px;
}

.info-text p {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
}

.search-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
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
  border-color: rgba(196, 77, 255, 0.5);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.search-btn {
  padding: 10px 18px;
  background: linear-gradient(135deg, #c44dff 0%, #ff6b9d 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(196, 77, 255, 0.4);
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  max-height: 250px;
  overflow-y: auto;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.result-item:hover:not(:disabled) {
  background: rgba(196, 77, 255, 0.1);
  border-color: rgba(196, 77, 255, 0.2);
}

.result-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result-icon {
  font-size: 20px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 107, 157, 0.2);
  border-radius: 50%;
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-name {
  font-weight: 500;
  font-size: 14px;
}

.result-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.result-action {
  font-size: 12px;
  color: #c44dff;
  padding: 4px 10px;
  background: rgba(196, 77, 255, 0.15);
  border-radius: 4px;
}

.error-msg {
  padding: 12px;
  background: rgba(255, 107, 107, 0.15);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  color: #ff6b6b;
  font-size: 13px;
  text-align: center;
  margin-bottom: 16px;
}

.hints {
  padding: 14px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  margin-bottom: 12px;
}

.hint-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 10px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.hint-icon {
  width: 24px;
  text-align: center;
}

.rate-limit-note {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
}
</style>
