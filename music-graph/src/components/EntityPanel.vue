<script setup lang="ts">
import { computed } from 'vue'
import type { MusicEntity, MusicGraph, RoleType } from '../types/music'

const props = defineProps<{
  entity: MusicEntity | null
  graph: MusicGraph
}>()

const emit = defineEmits<{
  (e: 'navigate', entityId: string): void
}>()

const roleLabels: Record<RoleType, string> = {
  primary_artist: 'Primary Artist',
  featured: 'Featured',
  producer: 'Producer',
  executive_producer: 'Executive Producer',
  co_producer: 'Co-Producer',
  vocal_producer: 'Vocal Producer',
  additional_producer: 'Additional Producer',
  songwriter: 'Songwriter',
  engineer: 'Engineer',
  vocals: 'Vocals',
  guitar: 'Guitar',
  bass: 'Bass',
  drums: 'Drums',
  keyboards: 'Keyboards',
  member_of: 'Member of',
  signed_to: 'Signed to',
  released_on: 'Released on',
  contains: 'Contains',
}

const roleColors: Record<RoleType, string> = {
  primary_artist: '#ff6b6b',
  featured: '#4ecdc4',
  producer: '#ffe66d',
  executive_producer: '#ffd93d',
  co_producer: '#ffec8b',
  vocal_producer: '#fff4a3',
  additional_producer: '#fff9c4',
  songwriter: '#95e1d3',
  engineer: '#a8d8ea',
  vocals: '#f38181',
  guitar: '#aa96da',
  bass: '#fcbad3',
  drums: '#a8d8ea',
  keyboards: '#d4a5a5',
  member_of: '#9b59b6',
  signed_to: '#3498db',
  released_on: '#e74c3c',
  contains: '#444444',
}

const typeIcons: Record<string, string> = {
  artist: '👤',
  track: '🎵',
  album: '💿',
  label: '🏷️',
}

const connections = computed(() => {
  if (!props.entity) return []

  const related: Array<{
    entity: MusicEntity
    role: RoleType
    direction: 'incoming' | 'outgoing'
  }> = []

  for (const rel of props.graph.relationships) {
    if (rel.source === props.entity.id) {
      const target = props.graph.entities.find(e => e.id === rel.target)
      if (target) {
        related.push({ entity: target, role: rel.role, direction: 'outgoing' })
      }
    }
    if (rel.target === props.entity.id) {
      const source = props.graph.entities.find(e => e.id === rel.source)
      if (source) {
        related.push({ entity: source, role: rel.role, direction: 'incoming' })
      }
    }
  }

  return related
})

const groupedConnections = computed(() => {
  const groups: Record<string, { role: RoleType; items: typeof connections.value }> = {}

  for (const conn of connections.value) {
    const key = roleLabels[conn.role] || conn.role
    if (!groups[key]) {
      groups[key] = { role: conn.role, items: [] }
    }
    groups[key].items.push(conn)
  }

  return groups
})

const connectionCount = computed(() => connections.value.length)

function handleNavigate(entityId: string) {
  emit('navigate', entityId)
}
</script>

<template>
  <aside class="entity-panel" :class="{ 'has-entity': entity }">
    <div v-if="entity" class="entity-content">
      <div class="entity-header">
        <div class="entity-icon-wrapper">
          <img
            v-if="entity.image"
            :src="entity.image"
            :alt="entity.name"
            class="entity-image"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <span v-else class="entity-icon">{{ typeIcons[entity.type] }}</span>
        </div>
        <div class="entity-info">
          <h2 class="entity-name">{{ entity.name }}</h2>
          <div class="entity-meta">
            <span class="entity-type">{{ entity.type }}</span>
            <span class="entity-connections">{{ connectionCount }} connections</span>
          </div>
        </div>
      </div>

      <div class="connections">
        <h3 class="section-title">Connections</h3>

        <div v-for="(group, label) in groupedConnections" :key="label" class="connection-group">
          <h4 class="role-label">
            <span class="role-dot" :style="{ background: roleColors[group.role] }"></span>
            {{ label }}
          </h4>
          <ul class="connection-list">
            <li
              v-for="conn in group.items"
              :key="conn.entity.id + conn.role"
              class="connection-item"
              @click="handleNavigate(conn.entity.id)"
            >
              <div class="conn-icon-wrapper">
                <img
                  v-if="conn.entity.image"
                  :src="conn.entity.image"
                  :alt="conn.entity.name"
                  class="conn-image"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                />
                <span v-else class="conn-icon">{{ typeIcons[conn.entity.type] }}</span>
              </div>
              <span class="conn-name">{{ conn.entity.name }}</span>
              <span class="conn-arrow">→</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">🎶</div>
      <p>Select a node to explore its connections</p>
      <span class="empty-hint">Click any node in the graph</span>
    </div>
  </aside>
</template>

<style scoped>
.entity-panel {
  width: 340px;
  min-width: 340px;
  background: linear-gradient(180deg, #1e1e30 0%, #151524 100%);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.entity-content {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.entity-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.entity-icon-wrapper {
  position: relative;
}

.entity-icon {
  font-size: 28px;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(196, 77, 255, 0.2) 0%, rgba(255, 107, 157, 0.2) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
}

.entity-image {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.entity-info {
  flex: 1;
  min-width: 0;
}

.entity-name {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 6px 0;
  color: #ffffff;
  line-height: 1.2;
}

.entity-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.entity-type {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: capitalize;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
}

.entity-connections {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 16px 0;
}

.connection-group {
  margin-bottom: 20px;
}

.role-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  margin: 0 0 10px 0;
}

.role-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.connection-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.connection-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.connection-item:active {
  transform: translateX(2px);
}

.conn-icon-wrapper {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.conn-icon {
  font-size: 16px;
  opacity: 0.8;
}

.conn-image {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.conn-name {
  font-size: 14px;
  color: #ffffff;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-arrow {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  transition: all 0.2s ease;
}

.connection-item:hover .conn-arrow {
  color: rgba(255, 255, 255, 0.6);
  transform: translateX(2px);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(255, 255, 255, 0.4);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.empty-state p {
  text-align: center;
  font-size: 14px;
  margin: 0 0 8px 0;
  color: rgba(255, 255, 255, 0.5);
}

.empty-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}
</style>
