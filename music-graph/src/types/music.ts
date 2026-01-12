export type EntityType = 'artist' | 'track' | 'album' | 'label'

export type ReleaseType = 'Album' | 'Single' | 'EP' | 'Other'

export type RoleType =
  | 'primary_artist'
  | 'featured'
  | 'producer'
  | 'executive_producer'
  | 'co_producer'
  | 'vocal_producer'
  | 'additional_producer'
  | 'songwriter'
  | 'engineer'
  | 'vocals'
  | 'guitar'
  | 'bass'
  | 'drums'
  | 'keyboards'
  | 'member_of'
  | 'signed_to'
  | 'released_on'
  | 'contains'

export interface MusicEntity {
  id: string
  name: string
  type: EntityType
  image?: string
  metadata?: Record<string, string>

  // Navigation state for drill-down
  mbid?: string                 // MusicBrainz ID for API lookups
  releaseType?: ReleaseType     // For albums: Album, Single, EP
  parentId?: string             // ID of parent node
  depth?: number                // 0=root artist, 1=releases, 2=tracks, 3=personnel
  isExpanded?: boolean          // Whether children are shown
  isHidden?: boolean            // Hidden due to sibling expansion
  childrenLoaded?: boolean      // Whether children fetched from API
  childCount?: number           // Hint for UI (e.g., "12 tracks")
}

export interface Relationship {
  id: string
  source: string
  target: string
  role: RoleType
  startYear?: number
  endYear?: number
}

export interface MusicGraph {
  entities: MusicEntity[]
  relationships: Relationship[]
}
