<script setup lang="ts">
import { computed } from 'vue'
import type { MusicGraph, EntityType, RoleType } from '../types/music'

const props = defineProps<{
  graph: MusicGraph
}>()

const emit = defineEmits<{
  (e: 'navigate', entityId: string): void
}>()

// Count entities by type
const entityCounts = computed(() => {
  const counts: Record<EntityType, number> = {
    artist: 0,
    track: 0,
    album: 0,
    label: 0,
  }
  for (const entity of props.graph.entities) {
    counts[entity.type]++
  }
  return counts
})

// Count relationships by role
const roleCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const rel of props.graph.relationships) {
    counts[rel.role] = (counts[rel.role] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
})

// Most connected nodes
const mostConnected = computed(() => {
  const degrees: Record<string, number> = {}
  for (const rel of props.graph.relationships) {
    degrees[rel.source] = (degrees[rel.source] || 0) + 1
    degrees[rel.target] = (degrees[rel.target] || 0) + 1
  }

  return Object.entries(degrees)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({
      entity: props.graph.entities.find(e => e.id === id)!,
      count,
    }))
    .filter(item => item.entity)
})

// Collaboration pairs (most shared connections)
const topCollaborators = computed(() => {
  const pairs: Record<string, number> = {}

  // Group entities by track
  const trackArtists: Record<string, string[]> = {}
  for (const rel of props.graph.relationships) {
    if (rel.role === 'primary_artist' || rel.role === 'featured') {
      const trackId = rel.source
      if (!trackArtists[trackId]) trackArtists[trackId] = []
      trackArtists[trackId].push(rel.target)
    }
  }

  // Count pairs
  for (const artists of Object.values(trackArtists)) {
    for (let i = 0; i < artists.length; i++) {
      for (let j = i + 1; j < artists.length; j++) {
        const key = [artists[i], artists[j]].sort().join('|')
        pairs[key] = (pairs[key] || 0) + 1
      }
    }
  }

  return Object.entries(pairs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => {
      const [id1, id2] = key.split('|')
      return {
        artist1: props.graph.entities.find(e => e.id === id1),
        artist2: props.graph.entities.find(e => e.id === id2),
        count,
      }
    })
    .filter(item => item.artist1 && item.artist2)
})

const typeIcons: Record<string, string> = {
  artist: '👤',
  track: '🎵',
  album: '💿',
  label: '🏷️',
}

const roleLabels: Record<string, string> = {
  primary_artist: 'Primary',
  featured: 'Featured',
  producer: 'Producer',
  songwriter: 'Writer',
  vocals: 'Vocals',
  signed_to: 'Signed',
  contains: 'Contains',
}
</script>

<template>
  <div class="stats-panel">
    <div class="stats-header">
      <h3>Statistics</h3>
    </div>

    <div class="stats-content">
      <!-- Entity counts -->
      <div class="stats-section">
        <h4>Entities</h4>
        <div class="entity-counts">
          <div class="count-item" v-for="(count, type) in entityCounts" :key="type">
            <span class="count-icon">{{ typeIcons[type] }}</span>
            <span class="count-value">{{ count }}</span>
            <span class="count-label">{{ type }}s</span>
          </div>
        </div>
      </div>

      <!-- Most connected -->
      <div class="stats-section">
        <h4>Most Connected</h4>
        <div class="top-list">
          <button
            v-for="(item, i) in mostConnected"
            :key="item.entity.id"
            class="top-item"
            @click="emit('navigate', item.entity.id)"
          >
            <span class="top-rank">{{ i + 1 }}</span>
            <span class="top-icon">{{ typeIcons[item.entity.type] }}</span>
            <span class="top-name">{{ item.entity.name }}</span>
            <span class="top-count">{{ item.count }}</span>
          </button>
        </div>
      </div>

      <!-- Top collaborators -->
      <div v-if="topCollaborators.length > 0" class="stats-section">
        <h4>Top Collaborators</h4>
        <div class="collab-list">
          <div v-for="collab in topCollaborators" :key="collab.artist1?.id + collab.artist2?.id" class="collab-item">
            <button class="collab-artist" @click="emit('navigate', collab.artist1!.id)">
              {{ collab.artist1?.name }}
            </button>
            <span class="collab-x">×</span>
            <button class="collab-artist" @click="emit('navigate', collab.artist2!.id)">
              {{ collab.artist2?.name }}
            </button>
            <span class="collab-count">{{ collab.count }} tracks</span>
          </div>
        </div>
      </div>

      <!-- Relationship distribution -->
      <div class="stats-section">
        <h4>Relationships</h4>
        <div class="role-bars">
          <div v-for="[role, count] in roleCounts" :key="role" class="role-bar">
            <span class="role-label">{{ roleLabels[role] || role }}</span>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ width: (count / (roleCounts[0]?.[1] || 1)) * 100 + '%' }"
              ></div>
            </div>
            <span class="role-count">{{ count }}</span>
          </div>
        </div>
      </div>

      <!-- Summary -->
      <div class="stats-summary">
        <div class="summary-stat">
          <span class="summary-value">{{ graph.entities.length }}</span>
          <span class="summary-label">Total Nodes</span>
        </div>
        <div class="summary-stat">
          <span class="summary-value">{{ graph.relationships.length }}</span>
          <span class="summary-label">Total Edges</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-panel {
  background: linear-gradient(180deg, #1e1e30 0%, #151524 100%);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.stats-header {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

.stats-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.stats-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats-section h4 {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 12px 0;
}

.entity-counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.count-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.count-icon {
  font-size: 16px;
  opacity: 0.8;
}

.count-value {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.count-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: capitalize;
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.top-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  color: #fff;
}

.top-item:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateX(4px);
}

.top-rank {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  background: rgba(196, 77, 255, 0.2);
  color: #c44dff;
  border-radius: 4px;
}

.top-icon {
  font-size: 14px;
  opacity: 0.7;
}

.top-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-count {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 10px;
}

.collab-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.collab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.collab-artist {
  background: rgba(255, 255, 255, 0.05);
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.collab-artist:hover {
  background: rgba(196, 77, 255, 0.2);
}

.collab-x {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

.collab-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-left: auto;
}

.role-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.role-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.role-bar .role-label {
  width: 60px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: capitalize;
}

.bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #c44dff 0%, #ff6b9d 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.role-count {
  width: 24px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
}

.stats-summary {
  display: flex;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.summary-stat {
  flex: 1;
  text-align: center;
}

.summary-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.summary-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
