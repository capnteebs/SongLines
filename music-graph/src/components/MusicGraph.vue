<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import cytoscape, { type Core, type NodeSingular, type EdgeSingular } from 'cytoscape'
// @ts-ignore
import fcose from 'cytoscape-fcose'
import type { MusicGraph, MusicEntity, RoleType } from '../types/music'

cytoscape.use(fcose)

const props = defineProps<{
  data: MusicGraph
  hiddenRoles?: RoleType[]
}>()

const emit = defineEmits<{
  (e: 'nodeSelect', entity: MusicEntity | null): void
  (e: 'pathFind', fromId: string): void
  (e: 'expand', data: { nodeId: string; nodeType: string; mbid?: string }): void
  (e: 'collapse', nodeId: string): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const minimapRef = ref<HTMLElement | null>(null)
const cy = ref<Core | null>(null)
const minimapCy = ref<Core | null>(null)
const selectedNode = ref<string | null>(null)
const hoveredEdge = ref<{ label: string; x: number; y: number } | null>(null)
const currentZoom = ref(1)
const contextMenu = ref<{ x: number; y: number; nodeId: string } | null>(null)
const viewport = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const showMinimap = ref(true)
const isDriftPaused = ref(false)
const currentLayout = ref<'force' | 'hierarchical' | 'circle'>('force')
const showSettings = ref(false)
const nodeSizeMagnitude = ref(1.0) // Range: 0.5 - 2.0

let animationFrame: number | null = null
let driftEnabled = true
let colorCycleInterval: number | null = null

const roleColors: Record<RoleType, string> = {
  // Artist roles - reds/corals
  primary_artist: '#ff6b6b',
  featured: '#4ecdc4',
  remixer: '#e056fd',
  // Production - yellows/golds
  producer: '#ffe66d',
  executive_producer: '#ffd93d',
  co_producer: '#ffec8b',
  vocal_producer: '#fff4a3',
  additional_producer: '#fff9c4',
  // Songwriting - greens
  songwriter: '#95e1d3',
  composer: '#7bed9f',
  lyricist: '#a3de83',
  arranger: '#b8e994',
  // Engineering - blues
  engineer: '#a8d8ea',
  mixing: '#74b9ff',
  mastering: '#81ecec',
  recording: '#a29bfe',
  programming: '#6c5ce7',
  // Vocals - pinks/reds
  vocals: '#f38181',
  background_vocals: '#fab1a0',
  choir: '#fd79a8',
  // Strings - purples
  guitar: '#aa96da',
  bass: '#fcbad3',
  violin: '#c39bd3',
  cello: '#bb8fce',
  strings: '#d7bde2',
  // Rhythm - teals
  drums: '#48dbfb',
  percussion: '#00d2d3',
  // Keys - warm tones
  keyboards: '#d4a5a5',
  piano: '#dfe6e9',
  organ: '#b2bec3',
  synthesizer: '#00cec9',
  // Brass & Woodwinds - oranges/bronzes
  saxophone: '#f39c12',
  trumpet: '#e17055',
  horns: '#d35400',
  flute: '#fdcb6e',
  woodwinds: '#f8b739',
  // Other
  harmonica: '#78e08f',
  turntables: '#e056fd',
  other_instrument: '#636e72',
  // Relationships
  member_of: '#9b59b6',
  signed_to: '#3498db',
  released_on: '#e74c3c',
  contains: '#444444',
}

const roleLabels: Record<RoleType, string> = {
  // Artist roles
  primary_artist: 'Primary Artist',
  featured: 'Featured',
  remixer: 'Remixer',
  // Production
  producer: 'Producer',
  executive_producer: 'Executive Producer',
  co_producer: 'Co-Producer',
  vocal_producer: 'Vocal Producer',
  additional_producer: 'Additional Producer',
  // Songwriting
  songwriter: 'Songwriter',
  composer: 'Composer',
  lyricist: 'Lyricist',
  arranger: 'Arranger',
  // Engineering
  engineer: 'Engineer',
  mixing: 'Mixing',
  mastering: 'Mastering',
  recording: 'Recording',
  programming: 'Programming',
  // Vocals
  vocals: 'Vocals',
  background_vocals: 'Background Vocals',
  choir: 'Choir',
  // Strings
  guitar: 'Guitar',
  bass: 'Bass',
  violin: 'Violin',
  cello: 'Cello',
  strings: 'Strings',
  // Rhythm
  drums: 'Drums',
  percussion: 'Percussion',
  // Keys
  keyboards: 'Keyboards',
  piano: 'Piano',
  organ: 'Organ',
  synthesizer: 'Synthesizer',
  // Brass & Woodwinds
  saxophone: 'Saxophone',
  trumpet: 'Trumpet',
  horns: 'Horns',
  flute: 'Flute',
  woodwinds: 'Woodwinds',
  // Other
  harmonica: 'Harmonica',
  turntables: 'Turntables',
  other_instrument: 'Other',
  // Relationships
  member_of: 'Member of',
  signed_to: 'Signed to',
  released_on: 'Released on',
  contains: 'Contains',
}

// Role weights for contribution scoring (higher = more important)
const roleWeights: Record<RoleType, number> = {
  // Artist roles
  primary_artist: 100,
  featured: 60,
  remixer: 55,
  // Production
  producer: 50,
  executive_producer: 48,
  co_producer: 45,
  vocal_producer: 40,
  additional_producer: 35,
  // Songwriting
  songwriter: 45,
  composer: 45,
  lyricist: 40,
  arranger: 35,
  // Engineering
  engineer: 25,
  mixing: 25,
  mastering: 20,
  recording: 20,
  programming: 30,
  // Vocals
  vocals: 35,
  background_vocals: 25,
  choir: 20,
  // Strings
  guitar: 20,
  bass: 20,
  violin: 20,
  cello: 20,
  strings: 20,
  // Rhythm
  drums: 20,
  percussion: 15,
  // Keys
  keyboards: 20,
  piano: 20,
  organ: 15,
  synthesizer: 20,
  // Brass & Woodwinds
  saxophone: 20,
  trumpet: 20,
  horns: 20,
  flute: 15,
  woodwinds: 15,
  // Other
  harmonica: 15,
  turntables: 25,
  other_instrument: 10,
  // Relationships
  member_of: 10,
  signed_to: 5,
  released_on: 5,
  contains: 0,
}

const entityColors: Record<string, string> = {
  artist: '#ff6b9d',
  track: '#c44dff',
  album: '#4d79ff',
  label: '#50c878',
}

const entityShapes: Record<string, string> = {
  artist: 'ellipse',
  track: 'round-diamond',
  album: 'round-rectangle',
  label: 'round-hexagon',
}

// Filter edges based on hidden roles
const filteredRelationships = computed(() => {
  if (!props.hiddenRoles || props.hiddenRoles.length === 0) {
    return props.data.relationships
  }
  return props.data.relationships.filter(r => !props.hiddenRoles!.includes(r.role))
})

// Merge edges with same source/target into single edges with multiple roles
interface MergedEdge {
  id: string
  source: string
  target: string
  roles: RoleType[]
  roleLabels: string[]
}

const mergedEdges = computed((): MergedEdge[] => {
  const edgeMap = new Map<string, MergedEdge>()

  for (const rel of filteredRelationships.value) {
    // Create a consistent key regardless of direction
    const key = `${rel.source}->${rel.target}`

    if (edgeMap.has(key)) {
      const existing = edgeMap.get(key)!
      if (!existing.roles.includes(rel.role)) {
        existing.roles.push(rel.role)
        existing.roleLabels.push(roleLabels[rel.role] || rel.role)
      }
    } else {
      edgeMap.set(key, {
        id: `merged-${rel.source}-${rel.target}`,
        source: rel.source,
        target: rel.target,
        roles: [rel.role],
        roleLabels: [roleLabels[rel.role] || rel.role],
      })
    }
  }

  return Array.from(edgeMap.values())
})

// Color cycling state for multi-role edges
const edgeColorIndices = ref<Map<string, number>>(new Map())

function startColorCycling() {
  if (colorCycleInterval) return

  colorCycleInterval = window.setInterval(() => {
    if (!cy.value) return

    // Find all multi-role edges and cycle their colors
    const multiRoleEdges = mergedEdges.value.filter(e => e.roles.length > 1)

    for (const edge of multiRoleEdges) {
      const currentIndex = edgeColorIndices.value.get(edge.id) || 0
      const nextIndex = (currentIndex + 1) % edge.roles.length
      edgeColorIndices.value.set(edge.id, nextIndex)

      // Update the edge color in cytoscape
      const cyEdge = cy.value.$(`#${edge.id}`)
      if (cyEdge.length > 0) {
        const nextRole = edge.roles[nextIndex]!
        const nextColor = roleColors[nextRole]

        // Animate the color transition
        cyEdge.animate({
          style: {
            'line-color': nextColor,
            'target-arrow-color': nextColor,
          },
          duration: 800,
          easing: 'ease-in-out-sine',
        })
      }
    }
  }, 2000) // Cycle every 2 seconds
}

function stopColorCycling() {
  if (colorCycleInterval) {
    clearInterval(colorCycleInterval)
    colorCycleInterval = null
  }
}

function getNodeDegrees(): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const entity of props.data.entities) {
    degrees.set(entity.id, 0)
  }
  for (const rel of filteredRelationships.value) {
    degrees.set(rel.source, (degrees.get(rel.source) || 0) + 1)
    degrees.set(rel.target, (degrees.get(rel.target) || 0) + 1)
  }
  return degrees
}

// Calculate contribution scores based on role weights
// Returns: { score: weighted sum, roleCount: number of roles, roles: list of roles }
interface ContributionScore {
  score: number
  roleCount: number
  roles: RoleType[]
}

function getContributionScores(): Map<string, ContributionScore> {
  const scores = new Map<string, ContributionScore>()

  // Initialize all entities with zero scores
  for (const entity of props.data.entities) {
    scores.set(entity.id, { score: 0, roleCount: 0, roles: [] })
  }

  // Calculate scores based on relationships
  for (const rel of filteredRelationships.value) {
    const weight = roleWeights[rel.role] || 0

    // Add score to the source (usually the track) - not needed for sizing
    // Add score to the target (usually the artist/contributor)
    const targetScore = scores.get(rel.target)
    if (targetScore && weight > 0) {
      targetScore.score += weight
      targetScore.roleCount++
      if (!targetScore.roles.includes(rel.role)) {
        targetScore.roles.push(rel.role)
      }
    }

    // Also add to source if it's a "contains" or similar structural relationship
    // (e.g., album contains track - the track gets score)
    const sourceScore = scores.get(rel.source)
    if (sourceScore && rel.role === 'contains') {
      // Tracks get a small boost for being on albums
      sourceScore.score += 5
    }
  }

  // Bonus for having multiple roles (shows versatility)
  for (const [id, data] of scores) {
    if (data.roleCount > 1) {
      // Add 10% bonus per additional role
      data.score = Math.round(data.score * (1 + (data.roleCount - 1) * 0.1))
    }
  }

  return scores
}

// Get normalized size based on contribution score (0-1 range)
function getNormalizedSize(score: number, maxScore: number): number {
  if (maxScore === 0) return 0.5
  // Use sqrt for gentler scaling - prevents huge differences
  const normalized = Math.sqrt(score / maxScore)
  // Clamp between 0.3 and 1.0 so even low-score nodes are visible
  return Math.max(0.3, Math.min(1.0, normalized * 0.7 + 0.3))
}

function startDrift() {
  if (!cy.value || !driftEnabled) return

  const nodes = cy.value.nodes()
  const time = Date.now() / 1000

  nodes.forEach((node, i) => {
    if (node.grabbed()) return

    const currentPos = node.position()
    const offset = i * 0.5

    const dx = Math.sin(time * 0.3 + offset) * 0.15
    const dy = Math.cos(time * 0.4 + offset * 1.3) * 0.15

    node.position({
      x: currentPos.x + dx,
      y: currentPos.y + dy
    })
  })

  animationFrame = requestAnimationFrame(startDrift)
}

function stopDrift() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
}

function initGraph() {
  if (!containerRef.value) return

  const degrees = getNodeDegrees()
  const contributionScores = getContributionScores()
  const maxScore = Math.max(...Array.from(contributionScores.values()).map(s => s.score), 1)

  // Calculate max score for artists only
  const artistScores = Array.from(contributionScores.entries())
    .filter(([id]) => props.data.entities.find(e => e.id === id)?.type === 'artist')
    .map(([, score]) => score.score)
  const maxArtistScore = Math.max(...artistScores, 1)

  const nodes = props.data.entities.map(entity => {
    const degree = degrees.get(entity.id) || 0
    const contribution = contributionScores.get(entity.id) || { score: 0, roleCount: 0, roles: [] }

    // Only artists use contribution-based sizing, others stay at 1.0
    let normalizedSize = 1.0
    if (entity.type === 'artist' && contribution.score > 0) {
      normalizedSize = getNormalizedSize(contribution.score, maxArtistScore)
    }

    return {
      data: {
        id: entity.id,
        label: entity.name,
        type: entity.type,
        image: entity.image,
        degree,
        normalizedSize,
        // Contribution scoring data
        contributionScore: contribution.score,
        roleCount: contribution.roleCount,
        roles: contribution.roles,
        // Drill-down navigation properties
        mbid: entity.mbid,
        releaseType: entity.releaseType,
        parentId: entity.parentId,
        depth: entity.depth,
        isExpanded: entity.isExpanded || false,
        isHidden: entity.isHidden || false,
        childrenLoaded: entity.childrenLoaded || false,
        childCount: entity.childCount,
      }
    }
  })

  // Use merged edges (combining multiple roles into single edges)
  const edges = mergedEdges.value.map(edge => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      role: edge.roles[0], // Primary role for initial color
      roles: edge.roles,   // All roles for cycling
      roleLabel: edge.roleLabels.join(' / '),
      isMultiRole: edge.roles.length > 1,
    }
  }))

  cy.value = cytoscape({
    container: containerRef.value,
    elements: { nodes, edges },
    style: [
      {
        selector: 'node',
        style: {
          'shape': (ele: NodeSingular) => entityShapes[ele.data('type')] || 'ellipse',
          'background-color': (ele: NodeSingular) => entityColors[ele.data('type')] || '#888',
          'background-image': (ele: NodeSingular) => ele.data('image') || 'none',
          'background-fit': 'cover',
          'background-clip': 'node',
          'background-image-crossorigin': 'anonymous',
          'label': (ele: NodeSingular) => {
            const label = ele.data('label')
            const type = ele.data('type')
            const roleCount = ele.data('roleCount') || 0
            const score = ele.data('contributionScore') || 0

            // For artists, show role count if they have multiple roles
            if (type === 'artist' && roleCount > 1) {
              return `${label} (${roleCount} roles)`
            }
            // For artists with score, show score
            if (type === 'artist' && score > 0) {
              return `${label}`
            }
            return label
          },
          'color': '#ffffff',
          'text-valign': 'bottom',
          'text-margin-y': 8,
          'font-size': '10px',
          'font-weight': 600,
          'text-outline-color': '#0f0f1a',
          'text-outline-width': 2,
          'text-max-width': '90px',
          'text-wrap': 'ellipsis',
          'text-opacity': 0,
          'width': (ele: NodeSingular) => {
            const base = ele.data('type') === 'artist' ? 48 : ele.data('type') === 'track' ? 38 : 30
            return base * ele.data('normalizedSize') * nodeSizeMagnitude.value
          },
          'height': (ele: NodeSingular) => {
            const base = ele.data('type') === 'artist' ? 48 : ele.data('type') === 'track' ? 38 : 30
            return base * ele.data('normalizedSize') * nodeSizeMagnitude.value
          },
          'border-width': 2,
          'border-color': 'rgba(255, 255, 255, 0.12)',
          'shadow-blur': 0,
          'shadow-color': (ele: NodeSingular) => entityColors[ele.data('type')] || '#888',
          'shadow-offset-x': 0,
          'shadow-offset-y': 0,
          'shadow-opacity': 0,
          'transition-property': 'shadow-blur, shadow-opacity, border-color, border-width, width, height, text-opacity',
          'transition-duration': '0.25s',
          'transition-timing-function': 'ease-out',
        }
      },
      {
        selector: 'node.hover',
        style: {
          'shadow-blur': 30,
          'shadow-opacity': 1,
          'border-color': 'rgba(255, 255, 255, 0.7)',
          'border-width': 3,
          'text-opacity': 1,
          'z-index': 999,
          'width': (ele: NodeSingular) => {
            const base = ele.data('type') === 'artist' ? 48 : ele.data('type') === 'track' ? 38 : 30
            return base * ele.data('normalizedSize') * nodeSizeMagnitude.value * 1.15
          },
          'height': (ele: NodeSingular) => {
            const base = ele.data('type') === 'artist' ? 48 : ele.data('type') === 'track' ? 38 : 30
            return base * ele.data('normalizedSize') * nodeSizeMagnitude.value * 1.15
          },
        }
      },
      {
        selector: 'node.selected',
        style: {
          'shadow-blur': 40,
          'shadow-opacity': 1,
          'border-color': '#ffffff',
          'border-width': 3,
          'text-opacity': 1,
          'z-index': 1000,
        }
      },
      {
        selector: 'node.highlighted',
        style: {
          'shadow-blur': 20,
          'shadow-opacity': 0.8,
          'border-color': 'rgba(255, 255, 255, 0.5)',
          'text-opacity': 1,
          'opacity': 1,
        }
      },
      {
        selector: 'node.path',
        style: {
          'shadow-blur': 25,
          'shadow-opacity': 1,
          'shadow-color': '#00ff88',
          'border-color': '#00ff88',
          'border-width': 3,
          'text-opacity': 1,
        }
      },
      {
        selector: 'node.faded',
        style: {
          'opacity': 0.08,
          'shadow-opacity': 0,
          'text-opacity': 0,
        }
      },
      {
        selector: 'node.show-label',
        style: {
          'text-opacity': 1,
        }
      },
      {
        selector: 'node:grabbed',
        style: {
          'shadow-blur': 35,
          'shadow-opacity': 1,
          'border-color': '#ffffff',
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': (ele: EdgeSingular) => roleColors[ele.data('role') as RoleType] || '#666',
          'target-arrow-color': (ele: EdgeSingular) => roleColors[ele.data('role') as RoleType] || '#666',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.7,
          'curve-style': 'bezier',
          'opacity': 0.25,
          'transition-property': 'opacity, width',
          'transition-duration': '0.25s',
        }
      },
      {
        selector: 'edge.hover',
        style: {
          'opacity': 1,
          'width': 3,
          'z-index': 999,
        }
      },
      {
        selector: 'edge.highlighted',
        style: {
          'opacity': 0.85,
          'width': 2.5,
        }
      },
      {
        selector: 'edge[isMultiRole]',
        style: {
          'width': 2.5,
          'opacity': 0.4,
          'line-style': 'solid',
        }
      },
      {
        selector: 'edge.path',
        style: {
          'opacity': 1,
          'width': 3,
          'line-color': '#00ff88',
          'target-arrow-color': '#00ff88',
        }
      },
      {
        selector: 'edge.faded',
        style: {
          'opacity': 0.03,
        }
      },
      // Drill-down navigation styles
      {
        selector: 'node.drill-hidden',
        style: {
          'visibility': 'hidden',
          'opacity': 0,
        }
      },
      {
        selector: 'edge.drill-hidden',
        style: {
          'visibility': 'hidden',
          'opacity': 0,
        }
      },
      {
        selector: 'node.expanded',
        style: {
          'border-width': 3,
          'border-color': '#4ecdc4',
          'shadow-blur': 20,
          'shadow-opacity': 0.8,
          'shadow-color': '#4ecdc4',
        }
      },
      // Visual indicators for expandable nodes (dashed border = has children not loaded)
      {
        selector: 'node[childrenLoaded = false][mbid]',
        style: {
          'border-style': 'dashed',
          'border-width': 2,
          'border-color': 'rgba(255, 255, 255, 0.4)',
        }
      },
      // Now playing track indicator
      {
        selector: 'node[nowPlaying = true]',
        style: {
          'border-width': 4,
          'border-color': '#1DB954',
          'shadow-blur': 25,
          'shadow-opacity': 1,
          'shadow-color': '#1DB954',
        }
      },
      // Release type colors (albums=blue, singles=orange, EPs=green)
      {
        selector: 'node[releaseType = "Album"]',
        style: {
          'background-color': '#4d79ff',
        }
      },
      {
        selector: 'node[releaseType = "Single"]',
        style: {
          'background-color': '#ff9f43',
        }
      },
      {
        selector: 'node[releaseType = "EP"]',
        style: {
          'background-color': '#26de81',
        }
      },
    ],
    layout: {
      name: 'fcose',
      animate: true,
      animationDuration: 1000,
      animationEasing: 'ease-out-cubic',
      randomize: true,
      nodeSeparation: 120,
      idealEdgeLength: 150,
      nodeRepulsion: () => 8000,
      edgeElasticity: () => 0.1,
      gravity: 0.15,
      gravityRange: 1.5,
      numIter: 2500,
      padding: 80,
      fit: true,
    },
    minZoom: 0.15,
    maxZoom: 5,
    wheelSensitivity: 0.25,
    boxSelectionEnabled: false,
    // Touch support
    touchTapThreshold: 8,
    desktopTapThreshold: 4,
    autoungrabifyWhileSimulating: true,
  })

  // Touch event handlers for mobile
  let touchStartTime = 0
  let touchStartPos = { x: 0, y: 0 }

  cy.value.on('tapstart', 'node', () => {
    touchStartTime = Date.now()
  })

  cy.value.on('tapend', 'node', (evt) => {
    const touchDuration = Date.now() - touchStartTime
    // Long press on touch to open context menu
    if (touchDuration > 500) {
      const node = evt.target
      const pos = evt.renderedPosition
      contextMenu.value = {
        x: pos.x,
        y: pos.y,
        nodeId: node.id(),
      }
    }
  })

  function updateLabelVisibility() {
    if (!cy.value) return
    const zoom = cy.value.zoom()
    currentZoom.value = zoom

    cy.value.nodes().forEach(node => {
      if (node.hasClass('hover') || node.hasClass('selected') || node.hasClass('highlighted') || node.hasClass('path')) {
        return
      }

      if (zoom > 0.8) {
        node.addClass('show-label')
      } else {
        node.removeClass('show-label')
      }
    })
  }

  cy.value.on('zoom', updateLabelVisibility)
  updateLabelVisibility()

  // Node hover
  cy.value.on('mouseover', 'node', (evt) => {
    const node = evt.target
    if (!node.hasClass('faded')) {
      node.addClass('hover')

      const pos = node.position()
      const nearby = cy.value?.nodes().filter(n =>
        n.id() !== node.id() &&
        !n.hasClass('faded') &&
        Math.hypot(n.position().x - pos.x, n.position().y - pos.y) < 100
      )

      nearby?.forEach(n => {
        const nPos = n.position()
        const angle = Math.atan2(nPos.y - pos.y, nPos.x - pos.x)
        const pushDist = 8

        n.animate({
          position: {
            x: nPos.x + Math.cos(angle) * pushDist,
            y: nPos.y + Math.sin(angle) * pushDist
          },
          duration: 200,
          easing: 'ease-out',
        })
      })
    }
  })

  cy.value.on('mouseout', 'node', (evt) => {
    evt.target.removeClass('hover')
  })

  // Edge hover
  cy.value.on('mouseover', 'edge', (evt) => {
    const edge = evt.target
    if (!edge.hasClass('faded')) {
      edge.addClass('hover')

      const midpoint = edge.midpoint()
      const pan = cy.value!.pan()
      const zoom = cy.value!.zoom()

      hoveredEdge.value = {
        label: edge.data('roleLabel'),
        x: midpoint.x * zoom + pan.x,
        y: midpoint.y * zoom + pan.y,
      }
    }
  })

  cy.value.on('mouseout', 'edge', (evt) => {
    evt.target.removeClass('hover')
    hoveredEdge.value = null
  })

  // Single click - select
  cy.value.on('tap', 'node', (evt) => {
    const node = evt.target
    const nodeId = node.id()
    contextMenu.value = null

    if (selectedNode.value === nodeId) {
      deselectNode()
    } else {
      selectNodeById(nodeId, false)
    }
  })

  // Double click - expand/collapse for drill-down navigation
  cy.value.on('dbltap', 'node', (evt) => {
    const node = evt.target
    const nodeId = node.id()
    const isExpanded = node.data('isExpanded')
    const mbid = node.data('mbid')

    if (mbid) {
      if (isExpanded) {
        emit('collapse', nodeId)
      } else {
        emit('expand', {
          nodeId,
          nodeType: node.data('type'),
          mbid,
        })
      }
    } else {
      // Fallback to focus behavior for non-drilldown nodes
      focusOnNode(nodeId)
    }
  })

  // Right click - context menu
  cy.value.on('cxttap', 'node', (evt) => {
    const node = evt.target
    const pos = evt.renderedPosition

    contextMenu.value = {
      x: pos.x,
      y: pos.y,
      nodeId: node.id(),
    }
  })

  // Background tap to deselect
  cy.value.on('tap', (evt) => {
    if (evt.target === cy.value) {
      deselectNode()
      contextMenu.value = null
    }
  })

  // Dragging
  cy.value.on('grab', 'node', () => {
    driftEnabled = false
    stopDrift()
    contextMenu.value = null
  })

  cy.value.on('free', 'node', () => {
    driftEnabled = true
    setTimeout(() => startDrift(), 500)
  })

  cy.value.on('pan zoom', () => {
    if (hoveredEdge.value) {
      hoveredEdge.value = null
    }
    contextMenu.value = null
    updateViewport()
  })

  setTimeout(() => {
    startDrift()
    initMinimap()
  }, 1500)
}

function initMinimap() {
  if (!minimapRef.value || !cy.value) return

  const degrees = getNodeDegrees()
  const maxDegree = Math.max(...degrees.values(), 1)

  const nodes = props.data.entities.map(entity => {
    const degree = degrees.get(entity.id) || 0
    const normalizedSize = 0.5 + (degree / maxDegree) * 0.5

    return {
      data: {
        id: entity.id,
        type: entity.type,
        normalizedSize,
      }
    }
  })

  const edges = filteredRelationships.value.map(rel => ({
    data: {
      id: rel.id,
      source: rel.source,
      target: rel.target,
      role: rel.role,
    }
  }))

  minimapCy.value = cytoscape({
    container: minimapRef.value,
    elements: { nodes, edges },
    style: [
      {
        selector: 'node',
        style: {
          'background-color': (ele: NodeSingular) => entityColors[ele.data('type')] || '#888',
          'width': (ele: NodeSingular) => 6 * ele.data('normalizedSize') * nodeSizeMagnitude.value,
          'height': (ele: NodeSingular) => 6 * ele.data('normalizedSize') * nodeSizeMagnitude.value,
          'border-width': 0,
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 0.5,
          'line-color': 'rgba(255, 255, 255, 0.15)',
          'curve-style': 'bezier',
          'opacity': 0.4,
        }
      },
    ],
    layout: { name: 'preset' },
    userZoomingEnabled: false,
    userPanningEnabled: false,
    boxSelectionEnabled: false,
    autoungrabify: true,
    autounselectify: true,
  })

  // Sync positions from main graph
  syncMinimapPositions()

  // Update viewport indicator
  updateViewport()

  // Handle clicks on minimap to navigate
  minimapCy.value.on('tap', (evt) => {
    if (evt.target === minimapCy.value && cy.value) {
      const pos = evt.position
      cy.value.animate({
        center: { eles: cy.value.nodes().filter(n => {
          const nPos = n.position()
          return Math.hypot(nPos.x - pos.x, nPos.y - pos.y) < 50
        }).first() || undefined },
        pan: { x: -pos.x * cy.value.zoom() + (containerRef.value?.clientWidth || 0) / 2,
               y: -pos.y * cy.value.zoom() + (containerRef.value?.clientHeight || 0) / 2 },
        duration: 300,
        easing: 'ease-out',
      })
    }
  })

  minimapCy.value.on('tap', 'node', (evt) => {
    const nodeId = evt.target.id()
    selectNodeById(nodeId)
  })
}

function syncMinimapPositions() {
  if (!cy.value || !minimapCy.value) return

  cy.value.nodes().forEach(node => {
    const pos = node.position()
    const minimapNode = minimapCy.value?.getElementById(node.id())
    if (minimapNode && minimapNode.length > 0) {
      minimapNode.position(pos)
    }
  })

  minimapCy.value.fit(undefined, 10)
}

function updateViewport() {
  if (!cy.value || !minimapCy.value || !containerRef.value) return

  const mainExtent = cy.value.extent()
  const zoom = cy.value.zoom()
  const pan = cy.value.pan()

  const containerWidth = containerRef.value.clientWidth
  const containerHeight = containerRef.value.clientHeight

  // Calculate visible area in graph coordinates
  const visibleX = -pan.x / zoom
  const visibleY = -pan.y / zoom
  const visibleWidth = containerWidth / zoom
  const visibleHeight = containerHeight / zoom

  // Convert to minimap coordinates
  const minimapExtent = minimapCy.value.extent()
  const minimapWidth = minimapRef.value?.clientWidth || 150
  const minimapHeight = minimapRef.value?.clientHeight || 100

  const scaleX = minimapWidth / (minimapExtent.w || 1)
  const scaleY = minimapHeight / (minimapExtent.h || 1)
  const scale = Math.min(scaleX, scaleY)

  const offsetX = (minimapWidth - (minimapExtent.w * scale)) / 2
  const offsetY = (minimapHeight - (minimapExtent.h * scale)) / 2

  viewport.value = {
    x: (visibleX - minimapExtent.x1) * scale + offsetX,
    y: (visibleY - minimapExtent.y1) * scale + offsetY,
    width: visibleWidth * scale,
    height: visibleHeight * scale,
  }
}

function selectNodeById(nodeId: string, centerOnNode: boolean = true) {
  if (!cy.value) return

  const node = cy.value.getElementById(nodeId)
  if (!node || node.length === 0) return

  cy.value.nodes().removeClass('selected')
  cy.value.elements().removeClass('path')
  selectedNode.value = nodeId
  node.addClass('selected')
  highlightConnections(node as NodeSingular)

  if (centerOnNode) {
    cy.value.animate({
      center: { eles: node },
      zoom: 1.2,
      duration: 500,
      easing: 'ease-out-cubic',
    })
  }

  const entity = props.data.entities.find(e => e.id === nodeId)
  emit('nodeSelect', entity || null)
}

function focusOnNode(nodeId: string) {
  if (!cy.value) return

  const node = cy.value.getElementById(nodeId)
  if (!node || node.length === 0) return

  cy.value.animate({
    center: { eles: node },
    zoom: 2,
    duration: 400,
    easing: 'ease-out-cubic',
  })
}

function deselectNode() {
  selectedNode.value = null
  cy.value?.elements().removeClass('highlighted faded selected hover path')
  emit('nodeSelect', null)
}

function highlightConnections(node: NodeSingular) {
  if (!cy.value) return

  cy.value.elements().removeClass('highlighted faded path')

  const connectedEdges = node.connectedEdges()
  const connectedNodes = connectedEdges.connectedNodes()

  cy.value.elements().addClass('faded')

  node.removeClass('faded').addClass('highlighted')
  connectedEdges.removeClass('faded').addClass('highlighted')
  connectedNodes.removeClass('faded').addClass('highlighted')
}

function navigateToNeighbor(direction: 'next' | 'prev' | 'up' | 'down') {
  if (!cy.value || !selectedNode.value) return

  const node = cy.value.getElementById(selectedNode.value)
  if (!node || node.length === 0) return

  const neighbors = node.neighborhood().nodes().filter(n => !n.hasClass('faded'))
  if (neighbors.length === 0) return

  const currentPos = node.position()

  // Sort neighbors by direction
  const sorted = neighbors.toArray().sort((a, b) => {
    const aPos = a.position()
    const bPos = b.position()

    switch (direction) {
      case 'next':
      case 'up':
        return (aPos.y - currentPos.y) - (bPos.y - currentPos.y)
      case 'prev':
      case 'down':
        return (bPos.y - currentPos.y) - (aPos.y - currentPos.y)
      default:
        return 0
    }
  })

  // For left/right, sort by x
  if (direction === 'next') {
    sorted.sort((a, b) => a.position().x - b.position().x)
  } else if (direction === 'prev') {
    sorted.sort((a, b) => b.position().x - a.position().x)
  }

  const nextNode = sorted[0]
  if (nextNode) {
    selectNodeById(nextNode.id(), true)
  }
}

function findPath(fromId: string, toId: string) {
  if (!cy.value) return

  const dijkstra = cy.value.elements().dijkstra({
    root: `#${fromId}`,
    directed: false,
  })

  const path = dijkstra.pathTo(cy.value.getElementById(toId))

  cy.value.elements().removeClass('highlighted faded path')
  cy.value.elements().addClass('faded')

  path.removeClass('faded').addClass('path')
}

function resetView() {
  cy.value?.animate({
    fit: { eles: cy.value.elements(), padding: 80 },
    duration: 500,
    easing: 'ease-out-cubic',
  })
  deselectNode()
  hoveredEdge.value = null
  contextMenu.value = null
}

// ============================================
// INCREMENTAL GRAPH UPDATE METHODS
// ============================================

/**
 * Add nodes incrementally to the graph without full rebuild
 */
function addNodes(entities: MusicEntity[]) {
  if (!cy.value || entities.length === 0) return

  const newNodes = entities.map(entity => ({
    data: {
      id: entity.id,
      label: entity.name,
      type: entity.type,
      image: entity.image,
      mbid: entity.mbid,
      releaseType: entity.releaseType,
      parentId: entity.parentId,
      depth: entity.depth,
      isExpanded: entity.isExpanded || false,
      childrenLoaded: entity.childrenLoaded || false,
      degree: 0,
      normalizedSize: 0.5,
    }
  }))

  cy.value.add(newNodes)
}

/**
 * Add edges incrementally to the graph
 */
function addEdges(relationships: { id: string; source: string; target: string; role: string }[]) {
  if (!cy.value || relationships.length === 0) return

  const newEdges = relationships.map(rel => ({
    data: {
      id: rel.id,
      source: rel.source,
      target: rel.target,
      role: rel.role,
      roleLabel: roleLabels[rel.role as RoleType] || rel.role,
    }
  }))

  cy.value.add(newEdges)
}

/**
 * Remove nodes and their connected edges from the graph
 */
function removeNodes(nodeIds: string[]) {
  if (!cy.value || nodeIds.length === 0) return

  nodeIds.forEach(id => {
    const node = cy.value!.getElementById(id)
    if (node.length > 0) {
      node.connectedEdges().remove()
      node.remove()
    }
  })
}

/**
 * Hide nodes (for sibling hiding during drill-down)
 */
function hideNodes(nodeIds: string[]) {
  if (!cy.value || nodeIds.length === 0) return

  nodeIds.forEach(id => {
    const node = cy.value!.getElementById(id)
    if (node.length > 0) {
      node.addClass('drill-hidden')
      node.connectedEdges().addClass('drill-hidden')
    }
  })
}

/**
 * Show previously hidden nodes
 */
function showNodes(nodeIds: string[]) {
  if (!cy.value || nodeIds.length === 0) return

  nodeIds.forEach(id => {
    const node = cy.value!.getElementById(id)
    if (node.length > 0) {
      node.removeClass('drill-hidden')
      node.connectedEdges().removeClass('drill-hidden')
    }
  })
}

/**
 * Animate expand: position new children around parent, then animate outward
 */
function animateExpand(parentNodeId: string, childNodeIds: string[]) {
  if (!cy.value || childNodeIds.length === 0) return

  const parentNode = cy.value.getElementById(parentNodeId)
  if (!parentNode.length) return

  const parentPos = parentNode.position()
  const radius = 150
  const angleStep = (2 * Math.PI) / childNodeIds.length

  // Position children at parent initially, then animate outward
  childNodeIds.forEach((id, i) => {
    const node = cy.value!.getElementById(id)
    if (node.length > 0) {
      // Start at parent position with 0 opacity
      node.position(parentPos)
      node.style({ opacity: 0 })

      const angle = i * angleStep - Math.PI / 2 // Start from top
      const targetX = parentPos.x + Math.cos(angle) * radius
      const targetY = parentPos.y + Math.sin(angle) * radius

      // Animate outward
      node.animate({
        position: { x: targetX, y: targetY },
        style: { opacity: 1 },
        duration: 400,
        easing: 'ease-out-cubic' as any,
      })
    }
  })

  // Mark parent as expanded visually
  parentNode.addClass('expanded')

  // Fit view to show new nodes after animation
  setTimeout(() => {
    cy.value?.fit(undefined, 50)
  }, 450)
}

/**
 * Animate collapse: move children to parent, then remove them
 */
function animateCollapse(parentNodeId: string, childNodeIds: string[], callback?: () => void) {
  if (!cy.value || childNodeIds.length === 0) {
    callback?.()
    return
  }

  const parentNode = cy.value.getElementById(parentNodeId)
  if (!parentNode.length) {
    callback?.()
    return
  }

  const parentPos = parentNode.position()
  let completedCount = 0

  childNodeIds.forEach(id => {
    const node = cy.value!.getElementById(id)
    if (node.length > 0) {
      node.animate({
        position: parentPos,
        style: { opacity: 0 },
        duration: 300,
        easing: 'ease-in-cubic' as any,
        complete: () => {
          completedCount++
          if (completedCount === childNodeIds.length) {
            // Remove all children after animation
            removeNodes(childNodeIds)
            parentNode.removeClass('expanded')
            callback?.()
          }
        }
      })
    } else {
      completedCount++
    }
  })
}

/**
 * Update a node's data (e.g., mark as expanded)
 */
function updateNodeData(nodeId: string, data: Record<string, any>) {
  if (!cy.value) return

  const node = cy.value.getElementById(nodeId)
  if (node.length > 0) {
    Object.entries(data).forEach(([key, value]) => {
      node.data(key, value)
    })
  }
}

/**
 * Run layout on specific nodes only
 */
function layoutNodes(nodeIds: string[]) {
  if (!cy.value || nodeIds.length === 0) return

  const nodes = cy.value.collection()
  nodeIds.forEach(id => {
    const node = cy.value!.getElementById(id)
    if (node.length > 0) {
      nodes.merge(node)
    }
  })

  // Get connected edges
  const edges = nodes.connectedEdges()

  // Run a quick circle layout on just these nodes
  nodes.layout({
    name: 'circle',
    animate: true,
    animationDuration: 300,
    fit: false,
  }).run()
}

function zoomIn() {
  const zoom = cy.value?.zoom() || 1
  cy.value?.animate({
    zoom: Math.min(zoom * 1.5, 5),
    duration: 250,
    easing: 'ease-out',
  })
}

function zoomOut() {
  const zoom = cy.value?.zoom() || 1
  cy.value?.animate({
    zoom: Math.max(zoom / 1.5, 0.15),
    duration: 250,
    easing: 'ease-out',
  })
}

function exportImage() {
  if (!cy.value) return

  const png = cy.value.png({
    output: 'blob',
    bg: '#0d0d18',
    scale: 2,
    full: true,
  })

  const url = URL.createObjectURL(png)
  const a = document.createElement('a')
  a.href = url
  a.download = 'music-graph.png'
  a.click()
  URL.revokeObjectURL(url)
}

function toggleDrift() {
  isDriftPaused.value = !isDriftPaused.value
  if (isDriftPaused.value) {
    driftEnabled = false
    stopDrift()
  } else {
    driftEnabled = true
    startDrift()
  }
}

function changeLayout(layout: 'force' | 'hierarchical' | 'circle' | 'clustered') {
  if (!cy.value) return
  currentLayout.value = layout as 'force' | 'hierarchical' | 'circle'

  let layoutConfig: any

  switch (layout) {
    case 'force':
      layoutConfig = {
        name: 'fcose',
        animate: true,
        animationDuration: 800,
        animationEasing: 'ease-out-cubic',
        randomize: false,
        nodeSeparation: 120,
        idealEdgeLength: 150,
        nodeRepulsion: () => 8000,
        edgeElasticity: () => 0.1,
        gravity: 0.15,
        gravityRange: 1.5,
        numIter: 2500,
        padding: 80,
        fit: true,
      }
      break
    case 'hierarchical':
      layoutConfig = {
        name: 'breadthfirst',
        animate: true,
        animationDuration: 800,
        animationEasing: 'ease-out-cubic',
        directed: true,
        padding: 50,
        spacingFactor: 1.5,
        fit: true,
      }
      break
    case 'circle':
      layoutConfig = {
        name: 'circle',
        animate: true,
        animationDuration: 800,
        animationEasing: 'ease-out-cubic',
        padding: 50,
        fit: true,
      }
      break
    case 'clustered':
      clusterByType()
      return
  }

  cy.value.layout(layoutConfig).run()

  // Re-sync minimap after layout
  setTimeout(() => {
    syncMinimapPositions()
    updateViewport()
  }, 900)
}

function clusterByType() {
  if (!cy.value) return

  const types = ['artist', 'track', 'album', 'label']
  const containerWidth = containerRef.value?.clientWidth || 800
  const containerHeight = containerRef.value?.clientHeight || 600

  // Calculate cluster centers in a grid
  const clusterPositions: Record<string, { x: number; y: number }> = {
    artist: { x: containerWidth * 0.25, y: containerHeight * 0.3 },
    track: { x: containerWidth * 0.75, y: containerHeight * 0.3 },
    album: { x: containerWidth * 0.25, y: containerHeight * 0.7 },
    label: { x: containerWidth * 0.75, y: containerHeight * 0.7 },
  }

  // Animate nodes to their cluster positions with some spread
  cy.value.nodes().forEach((node, i) => {
    const type = node.data('type')
    const center = clusterPositions[type] || clusterPositions.artist

    // Add some randomness within the cluster
    const angle = (i / cy.value!.nodes().length) * Math.PI * 2
    const radius = 50 + Math.random() * 80
    const targetX = center.x + Math.cos(angle) * radius
    const targetY = center.y + Math.sin(angle) * radius

    node.animate({
      position: { x: targetX, y: targetY },
      duration: 800,
      easing: 'ease-out-cubic',
    })
  })

  // Re-sync minimap after animation
  setTimeout(() => {
    syncMinimapPositions()
    updateViewport()
  }, 900)
}

function toggleEdgeBundling(enabled: boolean) {
  if (!cy.value) return

  if (enabled) {
    // Apply bezier curve styling for bundled effect
    cy.value.edges().style({
      'curve-style': 'unbundled-bezier',
      'control-point-distances': [40, -40],
      'control-point-weights': [0.25, 0.75],
    })
  } else {
    // Reset to default bezier
    cy.value.edges().style({
      'curve-style': 'bezier',
    })
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!selectedNode.value) return

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault()
      navigateToNeighbor('next')
      break
    case 'ArrowLeft':
      e.preventDefault()
      navigateToNeighbor('prev')
      break
    case 'ArrowUp':
      e.preventDefault()
      navigateToNeighbor('up')
      break
    case 'ArrowDown':
      e.preventDefault()
      navigateToNeighbor('down')
      break
    case 'Escape':
      deselectNode()
      contextMenu.value = null
      break
  }
}

function handleContextAction(action: string) {
  if (!contextMenu.value) return

  const nodeId = contextMenu.value.nodeId

  switch (action) {
    case 'focus':
      focusOnNode(nodeId)
      break
    case 'select':
      selectNodeById(nodeId, false)
      break
    case 'pathfind':
      emit('pathFind', nodeId)
      break
  }

  contextMenu.value = null
}

onMounted(() => {
  initGraph()
  startColorCycling()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  stopDrift()
  stopColorCycling()
  window.removeEventListener('keydown', handleKeydown)
  if (minimapCy.value) {
    minimapCy.value.destroy()
  }
})

watch(() => props.data, () => {
  stopDrift()
  if (cy.value) {
    cy.value.destroy()
  }
  if (minimapCy.value) {
    minimapCy.value.destroy()
    minimapCy.value = null
  }
  initGraph()
}, { deep: true })

watch(() => props.hiddenRoles, () => {
  stopDrift()
  if (cy.value) {
    cy.value.destroy()
  }
  if (minimapCy.value) {
    minimapCy.value.destroy()
    minimapCy.value = null
  }
  initGraph()
}, { deep: true })

// Watch for node size magnitude changes and update styles
watch(nodeSizeMagnitude, () => {
  if (cy.value) {
    cy.value.style().update()
  }
  if (minimapCy.value) {
    minimapCy.value.style().update()
  }
})

defineExpose({
  resetView,
  selectNodeById,
  findPath,
  exportImage,
  focusOnNode,
  toggleDrift,
  changeLayout,
  isDriftPaused,
  currentLayout,
  clusterByType,
  toggleEdgeBundling,
  // Drill-down navigation methods
  addNodes,
  addEdges,
  removeNodes,
  hideNodes,
  showNodes,
  animateExpand,
  animateCollapse,
  updateNodeData,
  layoutNodes,
})
</script>

<template>
  <div class="graph-wrapper">
    <div ref="containerRef" class="graph-container"></div>

    <!-- Edge tooltip -->
    <Transition name="tooltip">
      <div
        v-if="hoveredEdge"
        class="edge-tooltip"
        :style="{ left: hoveredEdge.x + 'px', top: hoveredEdge.y + 'px' }"
      >
        {{ hoveredEdge.label }}
      </div>
    </Transition>

    <!-- Context menu -->
    <Transition name="menu">
      <div
        v-if="contextMenu"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <button class="menu-item" @click="handleContextAction('focus')">
          <span class="menu-icon">⊙</span> Focus
        </button>
        <button class="menu-item" @click="handleContextAction('select')">
          <span class="menu-icon">◉</span> Select
        </button>
        <button class="menu-item" @click="handleContextAction('pathfind')">
          <span class="menu-icon">⋯</span> Find Path To...
        </button>
      </div>
    </Transition>

    <!-- Mini-map -->
    <Transition name="minimap">
      <div v-if="showMinimap" class="minimap-wrapper">
        <div class="minimap-header">
          <span class="minimap-title">Overview</span>
          <button class="minimap-toggle" @click="showMinimap = false">×</button>
        </div>
        <div class="minimap-container">
          <div ref="minimapRef" class="minimap-canvas"></div>
          <div
            v-if="viewport"
            class="minimap-viewport"
            :style="{
              left: viewport.x + 'px',
              top: viewport.y + 'px',
              width: Math.max(viewport.width, 20) + 'px',
              height: Math.max(viewport.height, 15) + 'px',
            }"
          ></div>
        </div>
      </div>
    </Transition>

    <button v-if="!showMinimap" class="minimap-show" @click="showMinimap = true" title="Show minimap">
      <span>⊞</span>
    </button>

    <!-- Zoom indicator -->
    <div class="zoom-indicator">
      {{ Math.round(currentZoom * 100) }}%
    </div>

    <!-- Keyboard hint -->
    <div v-if="selectedNode" class="keyboard-hint">
      ← → ↑ ↓ navigate • Esc deselect
    </div>

    <!-- Controls -->
    <div class="graph-controls">
      <button class="control-btn" @click="zoomIn" title="Zoom In">
        <span>+</span>
      </button>
      <button class="control-btn" @click="zoomOut" title="Zoom Out">
        <span>−</span>
      </button>
      <div class="control-divider"></div>
      <button class="control-btn" :class="{ active: isDriftPaused }" @click="toggleDrift" :title="isDriftPaused ? 'Resume Animation' : 'Pause Animation'">
        <span>{{ isDriftPaused ? '▶' : '⏸' }}</span>
      </button>
      <div class="control-divider"></div>
      <button class="control-btn" @click="resetView" title="Reset View">
        <span>↻</span>
      </button>
      <button class="control-btn" @click="exportImage" title="Export Image">
        <span>⤓</span>
      </button>
      <div class="control-divider"></div>
      <button class="control-btn" :class="{ active: showSettings }" @click="showSettings = !showSettings" title="Settings">
        <span>⚙</span>
      </button>
    </div>

    <!-- Settings Panel -->
    <div v-if="showSettings" class="settings-panel">
      <div class="settings-header">
        <span>Settings</span>
        <button class="settings-close" @click="showSettings = false">×</button>
      </div>
      <div class="settings-content">
        <div class="setting-item">
          <label class="setting-label">Node Size</label>
          <div class="setting-control">
            <input
              type="range"
              v-model.number="nodeSizeMagnitude"
              min="0.5"
              max="2"
              step="0.1"
              class="setting-slider"
            />
            <span class="setting-value">{{ nodeSizeMagnitude.toFixed(1) }}x</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Layout switcher -->
    <div class="layout-switcher">
      <button
        class="layout-btn"
        :class="{ active: currentLayout === 'force' }"
        @click="changeLayout('force')"
        title="Force Layout"
      >
        <span>◎</span>
      </button>
      <button
        class="layout-btn"
        :class="{ active: currentLayout === 'hierarchical' }"
        @click="changeLayout('hierarchical')"
        title="Hierarchical Layout"
      >
        <span>⋮</span>
      </button>
      <button
        class="layout-btn"
        :class="{ active: currentLayout === 'circle' }"
        @click="changeLayout('circle')"
        title="Circle Layout"
      >
        <span>○</span>
      </button>
      <button
        class="layout-btn"
        @click="changeLayout('clustered')"
        title="Cluster by Type"
      >
        <span>⊕</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.graph-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.graph-container {
  width: 100%;
  height: 100%;
  background:
    radial-gradient(ellipse at 20% 30%, rgba(196, 77, 255, 0.07) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(255, 107, 157, 0.07) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(77, 121, 255, 0.04) 0%, transparent 60%),
    radial-gradient(ellipse at center, #16162a 0%, #0d0d18 100%);
  border-radius: 12px;
}

.edge-tooltip {
  position: absolute;
  transform: translate(-50%, -150%);
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.edge-tooltip::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid rgba(0, 0, 0, 0.92);
}

.context-menu {
  position: absolute;
  background: rgba(15, 15, 26, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 6px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 1001;
  min-width: 150px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.menu-icon {
  font-size: 14px;
  opacity: 0.6;
}

.tooltip-enter-active,
.tooltip-leave-active,
.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, -140%);
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.zoom-indicator {
  position: absolute;
  bottom: 16px;
  left: 16px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.keyboard-hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  pointer-events: none;
}

.graph-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(10, 10, 20, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 6px;
}

.control-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 18px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.control-btn:active {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(0.95);
}

.control-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 6px;
}

/* Mini-map */
.minimap-wrapper {
  position: absolute;
  bottom: 60px;
  left: 16px;
  background: rgba(10, 10, 20, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.minimap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.minimap-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.4);
}

.minimap-toggle {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.minimap-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.minimap-container {
  position: relative;
  width: 180px;
  height: 120px;
}

.minimap-canvas {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
}

.minimap-viewport {
  position: absolute;
  border: 1.5px solid rgba(196, 77, 255, 0.7);
  background: rgba(196, 77, 255, 0.1);
  border-radius: 2px;
  pointer-events: none;
  box-shadow: 0 0 10px rgba(196, 77, 255, 0.3);
}

.minimap-show {
  position: absolute;
  bottom: 60px;
  left: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 20, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: all 0.15s ease;
}

.minimap-show:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.minimap-enter-active,
.minimap-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.minimap-enter-from,
.minimap-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Settings Panel */
.settings-panel {
  position: absolute;
  bottom: 16px;
  right: 70px;
  min-width: 200px;
  background: rgba(10, 10, 20, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.settings-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.15s ease;
}

.settings-close:hover {
  color: rgba(255, 255, 255, 0.9);
}

.settings-content {
  padding: 12px 14px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.setting-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.setting-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #c44dff;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.setting-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 0 10px rgba(196, 77, 255, 0.5);
}

.setting-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #c44dff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.setting-value {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  min-width: 32px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Layout switcher */
.layout-switcher {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 2px;
  background: rgba(10, 10, 20, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 4px;
}

.layout-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.layout-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.layout-btn.active {
  background: rgba(196, 77, 255, 0.25);
  color: #c44dff;
}

.control-btn.active {
  background: rgba(196, 77, 255, 0.25);
  color: #c44dff;
}
</style>
