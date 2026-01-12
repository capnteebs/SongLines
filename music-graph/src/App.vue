<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import MusicGraph from './components/MusicGraph.vue'
import EntityPanel from './components/EntityPanel.vue'
import NowPlaying from './components/NowPlaying.vue'
import StatsPanel from './components/StatsPanel.vue'
import LastFmPanel from './components/LastFmPanel.vue'
import MusicBrainzPanel from './components/MusicBrainzPanel.vue'
import { sampleMusicGraph } from './data/sampleData'
import type { MusicEntity, MusicGraph as MusicGraphType, RoleType, Relationship } from './types/music'
import { useLocalStorage, defaultPreferences } from './composables/useLocalStorage'
import * as musicbrainz from './services/musicbrainz'
import { getCacheStats, clearCache } from './services/trackCache'

// Current graph data (can be replaced via import)
const graphData = ref<MusicGraphType>(sampleMusicGraph)

// Persisted preferences
const preferences = useLocalStorage('musicgraph-prefs', defaultPreferences)
const theme = computed({
  get: () => preferences.value.theme,
  set: (val) => { preferences.value.theme = val }
})

const selectedEntity = ref<MusicEntity | null>(null)
const searchQuery = ref('')
const showSearch = ref(false)
const graphRef = ref<InstanceType<typeof MusicGraph> | null>(null)
const isFullscreen = ref(false)
const showFilters = ref(false)
const showStats = ref(false)
const showImportExport = ref(false)
const showLastFm = ref(false)
const showMusicBrainz = ref(false)
const hiddenRoles = ref<RoleType[]>(preferences.value.hiddenRoles as RoleType[])

// Cache stats
const cacheStats = ref(getCacheStats())
const lastfmUsername = computed({
  get: () => preferences.value.lastfmUsername,
  set: (val) => { preferences.value.lastfmUsername = val }
})

// Drill-down navigation state
const navigationState = reactive({
  rootArtistId: null as string | null,
  expandedPath: [] as string[],  // Stack of expanded node IDs
  currentDepth: 0,
  isLoading: false,
  loadingMessage: '',
})

// Track which entities are currently in the graph for drill-down
const graphEntities = ref<Map<string, MusicEntity>>(new Map())
const graphRelationships = ref<Map<string, Relationship>>(new Map())

// Sync hiddenRoles to preferences
watch(hiddenRoles, (val) => {
  preferences.value.hiddenRoles = val
}, { deep: true })

// Breadcrumb navigation
const breadcrumbs = ref<MusicEntity[]>([])
const maxBreadcrumbs = 8

// Path finding
const pathFindFrom = ref<string | null>(null)
const showPathFinder = ref(false)
const pathSearchQuery = ref('')

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []

  const query = searchQuery.value.toLowerCase()
  return sampleMusicGraph.entities
    .filter(e => e.name.toLowerCase().includes(query))
    .slice(0, 8)
})

const pathSearchResults = computed(() => {
  if (!pathSearchQuery.value.trim()) return []

  const query = pathSearchQuery.value.toLowerCase()
  return sampleMusicGraph.entities
    .filter(e => e.name.toLowerCase().includes(query) && e.id !== pathFindFrom.value)
    .slice(0, 6)
})

const roleFilters: { role: RoleType; label: string; color: string }[] = [
  { role: 'primary_artist', label: 'Primary', color: '#ff6b6b' },
  { role: 'featured', label: 'Featured', color: '#4ecdc4' },
  { role: 'producer', label: 'Producer', color: '#ffe66d' },
  { role: 'songwriter', label: 'Songwriter', color: '#95e1d3' },
  { role: 'vocals', label: 'Vocals', color: '#f38181' },
  { role: 'signed_to', label: 'Signed To', color: '#3498db' },
  { role: 'contains', label: 'Contains', color: '#444444' },
]

const typeIcons: Record<string, string> = {
  artist: '👤',
  track: '🎵',
  album: '💿',
  label: '🏷️',
}

function handleNodeSelect(entity: MusicEntity | null) {
  selectedEntity.value = entity

  // Update breadcrumbs
  if (entity) {
    const existingIndex = breadcrumbs.value.findIndex(b => b.id === entity.id)
    if (existingIndex >= 0) {
      // If already in breadcrumbs, truncate to that point
      breadcrumbs.value = breadcrumbs.value.slice(0, existingIndex + 1)
    } else {
      breadcrumbs.value.push(entity)
      if (breadcrumbs.value.length > maxBreadcrumbs) {
        breadcrumbs.value.shift()
      }
    }
  }
}

function handleNavigate(entityId: string) {
  graphRef.value?.selectNodeById(entityId)
}

function handleSearchSelect(entity: MusicEntity) {
  graphRef.value?.selectNodeById(entity.id)
  searchQuery.value = ''
  showSearch.value = false
}

function toggleSearch() {
  showSearch.value = !showSearch.value
  if (showSearch.value) {
    setTimeout(() => {
      document.getElementById('search-input')?.focus()
    }, 100)
  }
}

function handleViewInGraph(trackId: string) {
  graphRef.value?.selectNodeById(trackId)
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

function toggleFilter(role: RoleType) {
  const index = hiddenRoles.value.indexOf(role)
  if (index >= 0) {
    hiddenRoles.value.splice(index, 1)
  } else {
    hiddenRoles.value.push(role)
  }
}

function handleBreadcrumbClick(entity: MusicEntity) {
  graphRef.value?.selectNodeById(entity.id)
}

function clearBreadcrumbs() {
  breadcrumbs.value = []
  graphRef.value?.resetView()
}

// Path finding
function handlePathFind(fromId: string) {
  pathFindFrom.value = fromId
  showPathFinder.value = true
  pathSearchQuery.value = ''
  setTimeout(() => {
    document.getElementById('path-search-input')?.focus()
  }, 100)
}

function selectPathTarget(entity: MusicEntity) {
  if (pathFindFrom.value) {
    graphRef.value?.findPath(pathFindFrom.value, entity.id)
  }
  showPathFinder.value = false
  pathFindFrom.value = null
  pathSearchQuery.value = ''
}

function cancelPathFind() {
  showPathFinder.value = false
  pathFindFrom.value = null
  pathSearchQuery.value = ''
}

// Keyboard shortcut for fullscreen
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    toggleFullscreen()
  }
}

// Theme toggle
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
}

// Apply theme on mount
onMounted(() => {
  document.documentElement.setAttribute('data-theme', theme.value)
})

// Load graph from external source (Last.fm, etc)
function handleLoadGraph(graph: MusicGraphType) {
  graphData.value = graph
  breadcrumbs.value = []
  selectedEntity.value = null
  // Reset navigation state
  navigationState.rootArtistId = null
  navigationState.expandedPath = []
  navigationState.currentDepth = 0
  graphEntities.value.clear()
  graphRelationships.value.clear()
}

// ============================================
// DRILL-DOWN NAVIGATION HANDLERS
// ============================================

/**
 * Initialize graph with an artist from MusicBrainz
 */
async function initializeMusicBrainzArtist(artistName: string) {
  navigationState.isLoading = true
  navigationState.loadingMessage = `Searching for ${artistName}...`

  try {
    const result = await musicbrainz.initializeArtistGraph(artistName)

    // Store copies of entities and relationships (to avoid triggering watch when modifying)
    graphEntities.value.clear()
    graphRelationships.value.clear()
    result.entities.forEach(e => graphEntities.value.set(e.id, { ...e }))
    result.relationships.forEach(r => graphRelationships.value.set(r.id, { ...r }))

    // Update graph data
    graphData.value = {
      entities: result.entities,
      relationships: result.relationships,
    }

    // Set navigation state
    const rootArtist = result.entities.find(e => e.depth === 0)
    if (rootArtist) {
      navigationState.rootArtistId = rootArtist.id
      navigationState.expandedPath = [rootArtist.id]
      navigationState.currentDepth = 1
    }

    breadcrumbs.value = []
    selectedEntity.value = null
    showMusicBrainz.value = false

    // Reset now playing tracking
    currentNowPlayingId.value = null
  } catch (error: any) {
    console.error('[MusicBrainz] Error initializing artist:', error)
    alert(error?.message || 'Failed to load artist from MusicBrainz')
  } finally {
    navigationState.isLoading = false
    navigationState.loadingMessage = ''
  }
}

/**
 * Handle expand event from MusicGraph
 */
async function handleExpand(data: { nodeId: string; nodeType: string; mbid?: string }) {
  if (!data.mbid || navigationState.isLoading) return

  const entity = graphEntities.value.get(data.nodeId)
  if (!entity) return

  navigationState.isLoading = true
  navigationState.loadingMessage = `Loading ${entity.name}...`

  try {
    let result: musicbrainz.DrillDownResult

    if (data.nodeType === 'album') {
      // Expand release to show tracks
      result = await musicbrainz.expandRelease(entity)
    } else if (data.nodeType === 'track') {
      // Expand track to show personnel
      result = await musicbrainz.expandTrack(entity)
    } else {
      console.warn('[Drill-down] Unsupported node type for expansion:', data.nodeType)
      return
    }

    if (result.entities.length === 0) {
      return
    }

    // Add new entities and relationships
    result.entities.forEach(e => graphEntities.value.set(e.id, e))
    result.relationships.forEach(r => graphRelationships.value.set(r.id, r))

    // Get sibling nodes (same parent) to hide
    const siblings = Array.from(graphEntities.value.values()).filter(e =>
      e.parentId === entity.parentId && e.id !== entity.id
    )
    const siblingIds = siblings.map(s => s.id)

    // Mark entity as expanded
    entity.isExpanded = true
    entity.childrenLoaded = true
    entity.childCount = result.entities.length

    // Update navigation path
    navigationState.expandedPath.push(data.nodeId)
    navigationState.currentDepth = (entity.depth || 0) + 1

    // Use incremental graph updates
    if (graphRef.value) {
      // Hide siblings
      if (siblingIds.length > 0) {
        graphRef.value.hideNodes(siblingIds)
        siblings.forEach(s => {
          const e = graphEntities.value.get(s.id)
          if (e) e.isHidden = true
        })
      }

      // Add new nodes and edges
      graphRef.value.addNodes(result.entities)
      graphRef.value.addEdges(result.relationships)

      // Animate expansion
      const childIds = result.entities.map(e => e.id)
      graphRef.value.animateExpand(data.nodeId, childIds)

      // Update parent node data
      graphRef.value.updateNodeData(data.nodeId, { isExpanded: true, childrenLoaded: true })
    }

  } catch (error: any) {
    console.error('[Drill-down] Error expanding node:', error)
    alert(error?.message || 'Failed to load children')
  } finally {
    navigationState.isLoading = false
    navigationState.loadingMessage = ''
  }
}

/**
 * Handle collapse event from MusicGraph
 */
function handleCollapse(nodeId: string) {
  const entity = graphEntities.value.get(nodeId)
  if (!entity || !entity.isExpanded) return

  // Find all descendants to remove
  const descendants = findDescendants(nodeId)
  const descendantIds = descendants.map(d => d.id)

  // Find siblings to show again
  const siblings = Array.from(graphEntities.value.values()).filter(e =>
    e.parentId === entity.parentId && e.id !== nodeId && e.isHidden
  )

  // Mark entity as collapsed
  entity.isExpanded = false

  // Update navigation path
  const pathIndex = navigationState.expandedPath.indexOf(nodeId)
  if (pathIndex >= 0) {
    navigationState.expandedPath = navigationState.expandedPath.slice(0, pathIndex + 1)
    navigationState.currentDepth = entity.depth || 0
  }

  // Use incremental graph updates
  if (graphRef.value) {
    // Animate collapse, then remove nodes
    graphRef.value.animateCollapse(nodeId, descendantIds, () => {
      // Remove descendants from our tracking
      descendantIds.forEach(id => {
        graphEntities.value.delete(id)
        // Also remove any relationships involving this node
        graphRelationships.value.forEach((rel, relId) => {
          if (rel.source === id || rel.target === id) {
            graphRelationships.value.delete(relId)
          }
        })
      })

      // Show siblings again
      if (siblings.length > 0) {
        const siblingIds = siblings.map(s => s.id)
        graphRef.value?.showNodes(siblingIds)
        siblings.forEach(s => {
          const e = graphEntities.value.get(s.id)
          if (e) e.isHidden = false
        })
      }
    })

    // Update parent node data
    graphRef.value.updateNodeData(nodeId, { isExpanded: false })
  }
}

/**
 * Find all descendant entities of a node
 */
function findDescendants(nodeId: string): MusicEntity[] {
  const descendants: MusicEntity[] = []
  const toProcess = [nodeId]

  while (toProcess.length > 0) {
    const currentId = toProcess.shift()!
    const children = Array.from(graphEntities.value.values()).filter(e => e.parentId === currentId)
    descendants.push(...children)
    toProcess.push(...children.map(c => c.id))
  }

  return descendants
}

/**
 * Navigate back one level
 */
function navigateBack() {
  if (navigationState.expandedPath.length <= 1) return

  const lastExpandedId = navigationState.expandedPath[navigationState.expandedPath.length - 1]
  if (!lastExpandedId) return

  // Don't collapse the root artist
  if (lastExpandedId === navigationState.rootArtistId) return

  handleCollapse(lastExpandedId)
}

// Track the current "now playing" node so we can clear it
const currentNowPlayingId = ref<string | null>(null)

/**
 * Handle track change from NowPlaying - build flat graph centered on the track
 */
async function handleNowPlayingTrackChange(data: { artist: string; track: string; album: string }) {
  // Don't process if we're already loading
  if (navigationState.isLoading) return

  navigationState.isLoading = true
  navigationState.loadingMessage = `Finding "${data.track}"...`

  try {
    // Clear previous now playing indicator
    if (currentNowPlayingId.value && graphRef.value) {
      graphRef.value.updateNodeData(currentNowPlayingId.value, { nowPlaying: false })
    }

    // Build a flat graph centered on the track
    const result = await musicbrainz.buildGraphFromTrack(data.track, data.artist, data.album)

    if (result.entities.length === 0) {
      // Fallback to artist-based search if track not found
      console.log('[NowPlaying] Track not found, falling back to artist search')
      await initializeMusicBrainzArtist(data.artist)
      return
    }

    // Update graph data with flat structure
    graphEntities.value.clear()
    graphRelationships.value.clear()
    result.entities.forEach(e => graphEntities.value.set(e.id, { ...e }))
    result.relationships.forEach(r => graphRelationships.value.set(r.id, { ...r }))

    graphData.value = {
      entities: result.entities,
      relationships: result.relationships,
    }

    // Reset navigation state for flat graph
    navigationState.rootArtistId = null
    navigationState.expandedPath = []
    navigationState.currentDepth = 0

    breadcrumbs.value = []
    selectedEntity.value = null

    // Wait for graph to render
    await new Promise(resolve => setTimeout(resolve, 300))

    // Find and highlight the track
    const track = result.entities.find(e => e.type === 'track')
    if (track) {
      graphRef.value?.selectNodeById(track.id)
      graphRef.value?.updateNodeData(track.id, { nowPlaying: true })
      currentNowPlayingId.value = track.id
    }
  } catch (error: any) {
    console.error('[NowPlaying] Error:', error)
  } finally {
    navigationState.isLoading = false
    navigationState.loadingMessage = ''
  }
}

// Import/Export
function exportGraphJSON() {
  const data = JSON.stringify(graphData.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'music-graph-data.json'
  a.click()
  URL.revokeObjectURL(url)
  showImportExport.value = false
}

function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string)
      if (data.entities && data.relationships) {
        graphData.value = data
        showImportExport.value = false
        breadcrumbs.value = []
        selectedEntity.value = null
      } else {
        alert('Invalid graph data format')
      }
    } catch {
      alert('Failed to parse JSON file')
    }
  }
  reader.readAsText(file)
}

// Cache management
function refreshCacheStats() {
  cacheStats.value = getCacheStats()
}

function handleClearCache() {
  if (confirm('Clear all cached track data? This will require re-fetching from MusicBrainz.')) {
    clearCache()
    refreshCacheStats()
  }
}

// Refresh cache stats when opening the modal
watch(showImportExport, (val) => {
  if (val) refreshCacheStats()
})

// Watch for escape to close modals
watch(showPathFinder, (val) => {
  if (val) {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelPathFind()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }
})
</script>

<template>
  <div class="app" :class="{ fullscreen: isFullscreen }" @keydown="handleKeydown">
    <header v-if="!isFullscreen" class="app-header">
      <div class="header-left">
        <div class="brand">
          <span class="logo">◉</span>
          <h1>MusicGraph</h1>
        </div>
      </div>

      <div class="header-center">
        <div class="search-wrapper" :class="{ active: showSearch }">
          <button class="search-toggle" @click="toggleSearch">
            <span class="search-icon">⌕</span>
          </button>
          <Transition name="search">
            <div v-if="showSearch" class="search-container">
              <input
                id="search-input"
                v-model="searchQuery"
                type="text"
                placeholder="Search artists, tracks, albums..."
                class="search-input"
                @keydown.escape="showSearch = false"
              />
              <Transition name="dropdown">
                <div v-if="searchResults.length > 0" class="search-results">
                  <button
                    v-for="result in searchResults"
                    :key="result.id"
                    class="search-result"
                    @click="handleSearchSelect(result)"
                  >
                    <span class="result-icon">{{ typeIcons[result.type] }}</span>
                    <span class="result-name">{{ result.name }}</span>
                    <span class="result-type">{{ result.type }}</span>
                  </button>
                </div>
              </Transition>
            </div>
          </Transition>
        </div>
      </div>

      <div class="header-right">
        <button class="header-btn musicbrainz-btn" @click="showMusicBrainz = true" title="Load from MusicBrainz (Drill-down)">
          <span>◎</span>
        </button>
        <button class="header-btn lastfm-btn" @click="showLastFm = true" title="Load from Last.fm">
          <span>♪</span>
        </button>
        <button class="header-btn" @click="showStats = !showStats" :class="{ active: showStats }" title="Statistics">
          <span>📊</span>
        </button>
        <button class="header-btn" @click="showImportExport = true" title="Import/Export">
          <span>⇄</span>
        </button>
        <button class="header-btn" @click="toggleTheme" :title="theme === 'dark' ? 'Light Mode' : 'Dark Mode'">
          <span>{{ theme === 'dark' ? '☀' : '🌙' }}</span>
        </button>
        <button class="header-btn" @click="toggleFullscreen" title="Fullscreen (Ctrl+F)">
          <span>⛶</span>
        </button>
      </div>
    </header>

    <!-- Breadcrumbs -->
    <div v-if="breadcrumbs.length > 0 && !isFullscreen" class="breadcrumbs">
      <button class="breadcrumb-clear" @click="clearBreadcrumbs" title="Clear history">×</button>
      <div class="breadcrumb-trail">
        <button
          v-for="(crumb, i) in breadcrumbs"
          :key="crumb.id"
          class="breadcrumb"
          :class="{ active: crumb.id === selectedEntity?.id }"
          @click="handleBreadcrumbClick(crumb)"
        >
          <span class="crumb-icon">{{ typeIcons[crumb.type] }}</span>
          <span class="crumb-name">{{ crumb.name }}</span>
          <span v-if="i < breadcrumbs.length - 1" class="crumb-arrow">→</span>
        </button>
      </div>
    </div>

    <main class="app-main">
      <div class="graph-area">
        <MusicGraph
          ref="graphRef"
          :data="graphData"
          :hidden-roles="hiddenRoles"
          @node-select="handleNodeSelect"
          @path-find="handlePathFind"
          @expand="handleExpand"
          @collapse="handleCollapse"
        />

        <!-- Loading overlay for drill-down operations -->
        <Transition name="fade">
          <div v-if="navigationState.isLoading" class="loading-overlay">
            <div class="loading-content">
              <div class="loading-spinner"></div>
              <span>{{ navigationState.loadingMessage }}</span>
            </div>
          </div>
        </Transition>

        <!-- Back button for drill-down navigation -->
        <Transition name="fade">
          <button
            v-if="navigationState.expandedPath.length > 1"
            class="back-button"
            @click="navigateBack"
          >
            <span class="back-icon">←</span> Back
          </button>
        </Transition>

        <!-- Fullscreen exit button -->
        <button v-if="isFullscreen" class="fullscreen-exit" @click="toggleFullscreen">
          Exit Fullscreen
        </button>

        <!-- Filter toggle -->
        <button class="filter-toggle" :class="{ active: showFilters }" @click="showFilters = !showFilters">
          <span>⚙</span> Filters
          <span v-if="hiddenRoles.length > 0" class="filter-badge">{{ hiddenRoles.length }}</span>
        </button>

        <!-- Filters panel -->
        <Transition name="panel">
          <div v-if="showFilters" class="filters-panel">
            <div class="filters-title">Relationship Types</div>
            <div class="filters-list">
              <button
                v-for="filter in roleFilters"
                :key="filter.role"
                class="filter-item"
                :class="{ hidden: hiddenRoles.includes(filter.role) }"
                @click="toggleFilter(filter.role)"
              >
                <span class="filter-dot" :style="{ background: filter.color }"></span>
                <span class="filter-label">{{ filter.label }}</span>
                <span class="filter-check">{{ hiddenRoles.includes(filter.role) ? '○' : '●' }}</span>
              </button>
            </div>
          </div>
        </Transition>

        <!-- Node type legend -->
        <div v-if="!isFullscreen" class="legend node-legend">
          <div class="legend-title">Nodes</div>
          <div class="legend-items">
            <div class="legend-item">
              <span class="legend-shape shape-circle" style="background: #ff6b9d"></span>
              <span>Artist</span>
            </div>
            <div class="legend-item">
              <span class="legend-shape shape-diamond" style="background: #c44dff"></span>
              <span>Track</span>
            </div>
            <div class="legend-item">
              <span class="legend-shape shape-rect" style="background: #4d79ff"></span>
              <span>Album</span>
            </div>
            <div class="legend-item">
              <span class="legend-shape shape-hex" style="background: #50c878"></span>
              <span>Label</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Panel (slides in) -->
      <Transition name="slide">
        <StatsPanel
          v-if="showStats && !isFullscreen"
          :graph="graphData"
          @navigate="handleNavigate"
        />
      </Transition>

      <EntityPanel
        v-if="!isFullscreen && !showStats"
        :entity="selectedEntity"
        :graph="graphData"
        @navigate="handleNavigate"
      />
    </main>

    <NowPlaying
      v-if="!isFullscreen"
      :graph="graphData"
      :lastfm-username="lastfmUsername"
      @view-in-graph="handleViewInGraph"
      @update-username="(u) => lastfmUsername = u"
      @track-change="handleNowPlayingTrackChange"
    />

    <!-- Import/Export modal -->
    <Transition name="modal">
      <div v-if="showImportExport" class="modal-overlay" @click.self="showImportExport = false">
        <div class="import-export-modal">
          <div class="modal-header">
            <h3>Import / Export</h3>
            <button class="modal-close" @click="showImportExport = false">×</button>
          </div>
          <div class="modal-body">
            <div class="ie-section">
              <h4>Export Graph Data</h4>
              <p>Download the current graph as a JSON file</p>
              <button class="ie-btn export-btn" @click="exportGraphJSON">
                <span>⤓</span> Export JSON
              </button>
            </div>
            <div class="ie-divider"></div>
            <div class="ie-section">
              <h4>Import Graph Data</h4>
              <p>Load a graph from a JSON file</p>
              <label class="ie-btn import-btn">
                <span>⤒</span> Import JSON
                <input type="file" accept=".json" @change="handleImport" hidden />
              </label>
            </div>
            <div class="ie-divider"></div>
            <div class="ie-section">
              <h4>Track Cache</h4>
              <p>Cached tracks load instantly without API calls</p>
              <div class="cache-stats">
                <div class="cache-stat">
                  <span class="cache-stat-value">{{ cacheStats.trackCount }}</span>
                  <span class="cache-stat-label">Tracks</span>
                </div>
                <div class="cache-stat">
                  <span class="cache-stat-value">{{ cacheStats.totalHits }}</span>
                  <span class="cache-stat-label">Cache Hits</span>
                </div>
              </div>
              <div v-if="cacheStats.oldestEntry" class="cache-dates">
                <span>Oldest: {{ cacheStats.oldestEntry.toLocaleDateString() }}</span>
                <span>Newest: {{ cacheStats.newestEntry?.toLocaleDateString() }}</span>
              </div>
              <button
                class="ie-btn clear-cache-btn"
                @click="handleClearCache"
                :disabled="cacheStats.trackCount === 0"
              >
                <span>🗑</span> Clear Cache
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Last.fm panel modal -->
    <Transition name="modal">
      <div v-if="showLastFm" class="modal-overlay" @click.self="showLastFm = false">
        <LastFmPanel
          @load-graph="handleLoadGraph"
          @close="showLastFm = false"
        />
      </div>
    </Transition>

    <!-- MusicBrainz panel modal -->
    <Transition name="modal">
      <div v-if="showMusicBrainz" class="modal-overlay" @click.self="showMusicBrainz = false">
        <MusicBrainzPanel
          @load-artist="initializeMusicBrainzArtist"
          @close="showMusicBrainz = false"
        />
      </div>
    </Transition>

    <!-- Path finder modal -->
    <Transition name="modal">
      <div v-if="showPathFinder" class="modal-overlay" @click.self="cancelPathFind">
        <div class="path-finder-modal">
          <div class="modal-header">
            <h3>Find Path To...</h3>
            <button class="modal-close" @click="cancelPathFind">×</button>
          </div>
          <div class="modal-body">
            <div class="path-from">
              From: <strong>{{ sampleMusicGraph.entities.find(e => e.id === pathFindFrom)?.name }}</strong>
            </div>
            <input
              id="path-search-input"
              v-model="pathSearchQuery"
              type="text"
              placeholder="Search for destination..."
              class="path-search-input"
            />
            <div v-if="pathSearchResults.length > 0" class="path-results">
              <button
                v-for="result in pathSearchResults"
                :key="result.id"
                class="path-result"
                @click="selectPathTarget(result)"
              >
                <span class="result-icon">{{ typeIcons[result.type] }}</span>
                <span class="result-name">{{ result.name }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0f0f1a;
  color: #ffffff;
}

.app.fullscreen .app-main {
  height: 100vh;
}

.app.fullscreen .graph-area {
  padding: 0;
}

.app-header {
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, #1a1a2e 0%, #12121f 100%);
  gap: 24px;
}

.header-left,
.header-right {
  flex: 1;
  display: flex;
  align-items: center;
}

.header-right {
  justify-content: flex-end;
}

.header-center {
  flex: 0 0 auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  font-size: 22px;
  color: #c44dff;
  text-shadow: 0 0 20px rgba(196, 77, 255, 0.5);
}

.brand h1 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #ff6b9d 0%, #c44dff 50%, #4d79ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.header-btn.lastfm-btn {
  background: rgba(213, 16, 7, 0.15);
  border-color: rgba(213, 16, 7, 0.3);
  color: #d51007;
}

.header-btn.lastfm-btn:hover {
  background: rgba(213, 16, 7, 0.25);
}

/* Breadcrumbs */
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  overflow-x: auto;
}

.breadcrumb-clear {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
}

.breadcrumb-clear:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.breadcrumb-trail {
  display: flex;
  align-items: center;
  gap: 4px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.breadcrumb:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.breadcrumb.active {
  background: rgba(196, 77, 255, 0.2);
  border-color: rgba(196, 77, 255, 0.3);
  color: #fff;
}

.crumb-icon {
  font-size: 11px;
}

.crumb-arrow {
  color: rgba(255, 255, 255, 0.3);
  margin-left: 4px;
}

/* Search */
.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-toggle {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.search-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.search-wrapper.active .search-toggle {
  background: rgba(196, 77, 255, 0.2);
  border-color: rgba(196, 77, 255, 0.3);
  color: #c44dff;
}

.search-container {
  position: absolute;
  top: 50%;
  left: 50px;
  transform: translateY(-50%);
  z-index: 100;
}

.search-input {
  width: 320px;
  padding: 10px 16px;
  background: rgba(15, 15, 26, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  outline: none;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.search-input:focus {
  border-color: rgba(196, 77, 255, 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(196, 77, 255, 0.1);
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 8px;
  background: rgba(15, 15, 26, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  overflow: hidden;
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.search-result {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.search-result:hover {
  background: rgba(255, 255, 255, 0.08);
}

.result-icon {
  font-size: 16px;
  opacity: 0.7;
}

.result-name {
  flex: 1;
}

.result-type {
  font-size: 11px;
  text-transform: capitalize;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
}

.search-enter-active,
.search-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.search-enter-from,
.search-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-10px);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.graph-area {
  flex: 1;
  position: relative;
  padding: 16px;
}

/* Fullscreen exit */
.fullscreen-exit {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  z-index: 100;
}

.fullscreen-exit:hover {
  background: rgba(0, 0, 0, 0.8);
}

/* Filter toggle */
.filter-toggle {
  position: absolute;
  top: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(15, 15, 26, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: all 0.2s ease;
  z-index: 10;
}

.filter-toggle:hover,
.filter-toggle.active {
  background: rgba(196, 77, 255, 0.15);
  border-color: rgba(196, 77, 255, 0.3);
  color: #fff;
}

.filter-badge {
  background: #c44dff;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

/* Filters panel */
.filters-panel {
  position: absolute;
  top: 64px;
  right: 24px;
  background: rgba(15, 15, 26, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(12px);
  min-width: 180px;
  z-index: 10;
}

.filters-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 12px;
}

.filters-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.filter-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.filter-item.hidden {
  opacity: 0.4;
}

.filter-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-label {
  flex: 1;
}

.filter-check {
  font-size: 10px;
  opacity: 0.5;
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Legend */
.legend {
  position: absolute;
  padding: 12px 16px;
  background: rgba(15, 15, 26, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.node-legend {
  top: 24px;
  left: 24px;
}

.legend-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 10px;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.legend-shape {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.shape-circle {
  border-radius: 50%;
}

.shape-diamond {
  transform: rotate(45deg) scale(0.8);
  border-radius: 3px;
}

.shape-rect {
  border-radius: 3px;
}

.shape-hex {
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}

/* Path finder modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.path-finder-modal {
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 400px;
  max-width: 90vw;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.modal-close {
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

.modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.modal-body {
  padding: 20px;
}

.path-from {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 16px;
}

.path-from strong {
  color: #fff;
}

.path-search-input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.path-search-input:focus {
  border-color: rgba(0, 255, 136, 0.4);
  box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.1);
}

.path-results {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.path-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.path-result:hover {
  background: rgba(0, 255, 136, 0.1);
  border-color: rgba(0, 255, 136, 0.2);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .path-finder-modal,
.modal-leave-active .path-finder-modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .path-finder-modal,
.modal-leave-to .path-finder-modal {
  transform: scale(0.95);
  opacity: 0;
}

/* Slide transition for stats panel */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Header button active state */
.header-btn.active {
  background: rgba(196, 77, 255, 0.2);
  border-color: rgba(196, 77, 255, 0.3);
  color: #c44dff;
}

.header-right {
  gap: 8px;
}

/* Import/Export modal */
.import-export-modal {
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 380px;
  max-width: 90vw;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.ie-section {
  padding: 4px 0;
}

.ie-section h4 {
  margin: 0 0 6px 0;
  font-size: 14px;
  font-weight: 600;
}

.ie-section p {
  margin: 0 0 14px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.ie-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 16px 0;
}

.ie-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.export-btn {
  background: linear-gradient(135deg, #c44dff 0%, #ff6b9d 100%);
  color: #fff;
}

.export-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(196, 77, 255, 0.4);
}

.import-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.import-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.clear-cache-btn {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
  border: 1px solid rgba(255, 107, 107, 0.3);
}

.clear-cache-btn:hover:not(:disabled) {
  background: rgba(255, 107, 107, 0.25);
}

.clear-cache-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cache-stats {
  display: flex;
  gap: 24px;
  margin: 12px 0;
}

.cache-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  min-width: 80px;
}

.cache-stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #4ecdc4;
}

.cache-stat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

.cache-dates {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 12px;
}

.modal-enter-active .import-export-modal,
.modal-leave-active .import-export-modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from .import-export-modal,
.modal-leave-to .import-export-modal {
  transform: scale(0.95);
  opacity: 0;
}

/* MusicBrainz button */
.header-btn.musicbrainz-btn {
  background: rgba(186, 0, 106, 0.15);
  border-color: rgba(186, 0, 106, 0.3);
  color: #ff6b9d;
}

.header-btn.musicbrainz-btn:hover {
  background: rgba(186, 0, 106, 0.25);
}

/* Loading overlay for drill-down */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 15, 26, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  border-radius: 12px;
  backdrop-filter: blur(4px);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(196, 77, 255, 0.2);
  border-top-color: #c44dff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Back button for drill-down navigation */
.back-button {
  position: absolute;
  top: 70px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(15, 15, 26, 0.9);
  border: 1px solid rgba(78, 205, 196, 0.3);
  border-radius: 8px;
  color: #4ecdc4;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: all 0.2s ease;
  z-index: 10;
}

.back-button:hover {
  background: rgba(78, 205, 196, 0.15);
  border-color: rgba(78, 205, 196, 0.5);
}

.back-icon {
  font-size: 16px;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
