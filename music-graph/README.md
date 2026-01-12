# MusicGraph

A graph-based music metadata visualization tool that lets you explore relationships between artists, tracks, albums, and labels.

## Features

### Graph Visualization
- **Interactive Force-Directed Graph** — Nodes naturally arrange themselves using physics simulation
- **Multiple Layouts** — Switch between Force, Hierarchical, Circle, and Clustered layouts
- **Dynamic Node Sizing** — Nodes scale based on their connection count
- **Animated Drift** — Subtle organic movement keeps the graph feeling alive
- **Smart Labels** — Labels appear based on zoom level to reduce clutter

### Navigation & Interaction

| Action | Desktop | Mobile |
|--------|---------|--------|
| Select node | Click | Tap |
| Focus & zoom | Double-click | Double-tap |
| Context menu | Right-click | Long-press |
| Pan | Drag background | Drag |
| Zoom | Scroll wheel | Pinch |
| Navigate connected | Arrow keys | — |
| Deselect | Escape | Tap background |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` `→` `↑` `↓` | Navigate between connected nodes |
| `Escape` | Deselect current node |
| `Ctrl/Cmd + F` | Toggle fullscreen mode |

### UI Panels

#### Entity Panel (Right Sidebar)
Shows details for the selected node:
- Entity name and type
- Connection count
- Grouped list of all relationships
- Click any connection to navigate to it

#### Statistics Panel
Toggle with the 📊 button in the header:
- Entity counts by type (artists, tracks, albums, labels)
- Top 5 most connected nodes
- Top collaborator pairs
- Relationship type distribution
- Total nodes and edges

#### Now Playing Bar
Mock music player at the bottom:
- Cycles through tracks in the graph
- Play/pause, previous/next controls
- Seekable progress bar
- "View in Graph" button to jump to current track

### Graph Controls (Bottom Right)

| Button | Action |
|--------|--------|
| `+` | Zoom in |
| `−` | Zoom out |
| `⏸`/`▶` | Pause/resume drift animation |
| `↻` | Reset view (fit all nodes) |
| `⤓` | Export graph as PNG image |

### Layout Switcher (Top Right)

| Button | Layout |
|--------|--------|
| `◎` | Force-directed (default) |
| `⋮` | Hierarchical (tree) |
| `○` | Circle |
| `⊕` | Clustered by type |

### Mini-Map (Bottom Left)
- Shows overview of entire graph
- Purple rectangle indicates current viewport
- Click to navigate
- Toggle visibility with `×` / `⊞` button

### Filters Panel
Click "⚙ Filters" to show/hide relationship types:
- Primary Artist
- Featured
- Producer
- Songwriter
- Vocals
- Signed To
- Contains

Hidden relationships are removed from the graph in real-time.

### Breadcrumb Trail
Navigation history appears below the header:
- Shows last 8 visited nodes
- Click any breadcrumb to return to it
- `×` button clears history

### Path Finding
Find the shortest path between two nodes:
1. Right-click a node → "Find Path To..."
2. Search for the destination node
3. Path highlights in green

### Themes
Toggle between dark and light themes using the ☀/🌙 button in the header. Preference is saved to localStorage.

### Import / Export
Click the `⇄` button in the header:
- **Export JSON** — Download current graph data
- **Import JSON** — Load a graph from file

## Data Format

### JSON Structure
```json
{
  "entities": [
    {
      "id": "artist-1",
      "name": "Artist Name",
      "type": "artist",
      "image": "https://..."
    }
  ],
  "relationships": [
    {
      "id": "rel-1",
      "source": "track-1",
      "target": "artist-1",
      "role": "primary_artist"
    }
  ]
}
```

### Entity Types
| Type | Description | Shape |
|------|-------------|-------|
| `artist` | Musicians, bands, producers | Circle |
| `track` | Songs, recordings | Diamond |
| `album` | Albums, EPs, singles | Rounded rectangle |
| `label` | Record labels | Hexagon |

### Relationship Roles
| Role | Description | Color |
|------|-------------|-------|
| `primary_artist` | Main performer | Red |
| `featured` | Featured artist | Teal |
| `producer` | Produced the track | Yellow |
| `songwriter` | Wrote the song | Light green |
| `engineer` | Recording/mixing engineer | Light blue |
| `vocals` | Vocal performance | Coral |
| `guitar` | Guitar performance | Purple |
| `bass` | Bass performance | Pink |
| `drums` | Drums performance | Light blue |
| `keyboards` | Keyboard performance | Dusty rose |
| `member_of` | Band membership | Purple |
| `signed_to` | Label contract | Blue |
| `released_on` | Release on label | Red |
| `contains` | Album contains track | Gray |

## API Integrations

### MusicBrainz (Ready to Use)
Located in `src/services/musicbrainz.ts`

Free, open music database with detailed relationship data.

```typescript
import { searchAndBuildGraph, getArtistRelations } from './services/musicbrainz'

// Search for an artist and build a graph
const graph = await searchAndBuildGraph('Radiohead')

// Get relations for a specific artist ID
const graph = await getArtistRelations('a74b1b7f-71a5-4011-9441-d0b5e4122711')
```

---

### Last.fm (Free API Key)
Located in `src/services/lastfm.ts`

Excellent for scrobble history, similar artists, and listening stats.

**Setup:**
1. Create account at [last.fm/api/account/create](https://www.last.fm/api/account/create)
2. Get your API key (instant, free)
3. Add to `src/services/lastfm.ts`

```typescript
import {
  buildGraphFromArtist,
  buildGraphFromUserHistory,
  getSimilarArtists,
  getUserTopArtists
} from './services/lastfm'

// Build graph from artist with similar artists & top tracks
const graph = await buildGraphFromArtist('Radiohead')

// Build graph from user's listening history
const graph = await buildGraphFromUserHistory('your_username')

// Get similar artists
const similar = await getSimilarArtists('Radiohead', 10)

// Get user's top artists for the month
const topArtists = await getUserTopArtists('username', '1month', 20)
```

---

### Deezer (No API Key Required)
Located in `src/services/deezer.ts`

Free access to catalog data. OAuth only needed for user-specific data.

```typescript
import {
  buildGraphFromArtist,
  buildGraphFromChart,
  searchArtist,
  getRelatedArtists
} from './services/deezer'

// Build graph from artist search
const graph = await buildGraphFromArtist('Daft Punk')

// Build graph from current chart
const graph = await buildGraphFromChart()

// Search for artists
const artists = await searchArtist('electronic', 10)

// Get related artists
const related = await getRelatedArtists(27, 10) // Daft Punk's ID
```

---

### Spotify (OAuth Required)
Located in `src/services/spotify.ts`

**Setup:**
1. Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Add your Client ID to `src/services/spotify.ts`
3. Set redirect URI to `http://localhost:5173/callback`

```typescript
import {
  getAuthUrl,
  handleCallback,
  isAuthenticated,
  buildGraphFromCurrentlyPlaying,
  buildGraphFromRecentlyPlayed
} from './services/spotify'

// Redirect to Spotify login
window.location.href = getAuthUrl()

// After callback, build graph from now playing
if (handleCallback()) {
  const graph = await buildGraphFromCurrentlyPlaying()
}

// Build from recent listening history
const graph = await buildGraphFromRecentlyPlayed()
```

---

### Apple Music / MusicKit (Developer Account Required)
Located in `src/services/apple-music.ts`

**Requirements:**
- Apple Developer Program ($99/year)
- MusicKit key from App Store Connect
- Server-side JWT token generation

**Setup:**
1. Go to [developer.apple.com](https://developer.apple.com/account/resources/authkeys/list)
2. Create a MusicKit key and download the `.p8` file
3. Generate a JWT token on your server (see file for example)
4. Add token to `src/services/apple-music.ts`

```typescript
import {
  initializeMusicKit,
  authorize,
  buildGraphFromArtist,
  buildGraphFromRecentlyPlayed,
  search
} from './services/apple-music'

// Initialize MusicKit (required first)
await initializeMusicKit()

// Build graph from artist (no auth needed)
const graph = await buildGraphFromArtist('Taylor Swift')

// For user data, authorize first
await authorize()
const graph = await buildGraphFromRecentlyPlayed()

// Search catalog
const results = await search('indie rock', ['artists', 'albums'], 10)
```

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
cd music-graph
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Type Check
```bash
npm run type-check
```

## Tech Stack
- **Vue 3** — Composition API with TypeScript
- **Vite** — Build tool and dev server
- **Cytoscape.js** — Graph visualization
- **cytoscape-fcose** — Force-directed layout algorithm

## Project Structure
```
src/
├── components/
│   ├── MusicGraph.vue    # Main graph visualization
│   ├── EntityPanel.vue   # Right sidebar details
│   ├── NowPlaying.vue    # Bottom music player bar
│   └── StatsPanel.vue    # Statistics dashboard
├── composables/
│   └── useLocalStorage.ts # Persistence helper
├── data/
│   └── sampleData.ts     # Demo graph data
├── services/
│   ├── apple-music.ts    # Apple MusicKit client
│   ├── deezer.ts         # Deezer API client
│   ├── lastfm.ts         # Last.fm API client
│   ├── musicbrainz.ts    # MusicBrainz API client
│   └── spotify.ts        # Spotify API client
├── types/
│   └── music.ts          # TypeScript definitions
├── App.vue               # Root component
├── main.ts               # Entry point
└── style.css             # Global styles & themes
```

## Saved Preferences
The following settings are persisted in localStorage:
- Theme (dark/light)
- Hidden relationship filters
- Minimap visibility
- Layout preference
- Drift animation state

## Screenshots

### Main Interface (Dark Theme)
```
┌─────────────────────────────────────────────────────────────────┐
│  ◉ MusicGraph                    [🔍] [📊] [⇄] [☀] [⛶]         │
├─────────────────────────────────────────────────────────────────┤
│  ← JAY-Z → Rihanna → Run This Town                              │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │                     │
│     ┌───┐        ┌───┐                    │  👤 Rihanna         │
│     │ 💿 │───────│ 🎵 │                    │  ─────────────────  │
│     └───┘        └───┘                    │  artist • 12 conn.  │
│        \          /  \                    │                     │
│         \        /    \   ┌───┐           │  CONNECTIONS        │
│          \      /      \──│ 👤 │           │  ───────────────    │
│           \    /          └───┘           │  Primary Artist     │
│            \  /                           │   • Umbrella        │
│           ┌───┐                           │   • Diamonds        │
│           │ 👤 │                           │  Featured           │
│           └───┘                           │   • Run This Town   │
│                                           │                     │
│  [Overview]  ◎ ⋮ ○ ⊕                      │                     │
│  ┌────────┐                    [+][-]     │                     │
│  │ · ·  · │                    [⏸][↻][⤓]  │                     │
│  │  ·   · │  85%                          │                     │
│  └────────┘                               │                     │
├───────────────────────────────────────────┴─────────────────────┤
│  🎵  Run This Town          ⏮  ▶  ⏭      ●────────○  2:15/3:30  │
│     JAY-Z, Rihanna          from The Blueprint 3    [View in Graph] │
└─────────────────────────────────────────────────────────────────┘
```

### Light Theme
The app includes a full light theme with adjusted colors for all components, activated via the sun/moon toggle in the header.

### Statistics Panel
Shows analytics including most connected nodes, collaborator pairs, and relationship distribution charts.

## Use Cases

### 🎵 Music Discovery
Explore an artist's connections to discover new music:
1. Search for a favorite artist
2. Explore their collaborations via the graph
3. Find producers who worked with multiple artists you like
4. Discover featured artists you haven't heard of

### 📚 Music Research
Study the music industry structure:
- Visualize which labels sign similar artists
- Track producer relationships across genres
- Map collaboration networks over time
- Analyze artist career trajectories

### 🎧 Personal Listening Analysis
Connect your streaming account to:
- Visualize your listening history as a graph
- See patterns in your music taste
- Discover connections between artists you already like
- Find the "bridges" between different genres you enjoy

### 📊 Data Visualization
Use MusicGraph for presentations or articles:
- Export high-resolution PNG images
- Create custom graphs via JSON import
- Embed in blog posts or research papers
- Generate visual aids for music journalism

### 🎓 Educational
Learn about music relationships:
- Understand the difference between writers, producers, and performers
- Visualize how albums, tracks, and artists connect
- Explore the structure of record labels
- Study collaboration patterns in different genres

## Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

Or connect your GitHub repo at [vercel.com](https://vercel.com) for automatic deployments.

### Netlify
```bash
# Install Netlify CLI
npm i -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --dir=dist --prod
```

Or drag-and-drop the `dist` folder at [netlify.com](https://app.netlify.com/drop).

### GitHub Pages
```bash
# Add to package.json scripts:
# "deploy": "npm run build && gh-pages -d dist"

npm install gh-pages --save-dev
npm run deploy
```

### Docker
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker build -t musicgraph .
docker run -p 8080:80 musicgraph
```

### Static Hosting
The built app is fully static. After `npm run build`, upload the `dist` folder to any static host:
- AWS S3 + CloudFront
- Google Cloud Storage
- Azure Static Web Apps
- Cloudflare Pages
- Surge.sh
- Firebase Hosting

## Configuration

### Environment Variables
Create a `.env` file for API keys:

```env
# Last.fm (free)
VITE_LASTFM_API_KEY=your_lastfm_api_key

# Spotify
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id

# Deezer (optional, for OAuth)
VITE_DEEZER_APP_ID=your_deezer_app_id

# Apple Music
VITE_APPLE_MUSIC_TOKEN=your_jwt_token
```

Access in code:
```typescript
const apiKey = import.meta.env.VITE_LASTFM_API_KEY
```

### Customization Options

#### Colors
Edit `src/style.css` to change the color scheme:
```css
:root {
  --accent-primary: #c44dff;   /* Main accent (purple) */
  --accent-secondary: #ff6b9d; /* Secondary accent (pink) */
  --accent-tertiary: #4d79ff;  /* Tertiary accent (blue) */
}
```

#### Node Colors
Edit `src/components/MusicGraph.vue`:
```typescript
const entityColors: Record<string, string> = {
  artist: '#ff6b9d',  // Pink
  track: '#c44dff',   // Purple
  album: '#4d79ff',   // Blue
  label: '#50c878',   // Green
}
```

#### Default Layout
Change the initial layout in `MusicGraph.vue`:
```typescript
const currentLayout = ref<'force' | 'hierarchical' | 'circle'>('force')
```

#### Sample Data
Replace `src/data/sampleData.ts` with your own data to change the default graph.

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Full support |
| Firefox | 88+ | ✅ Full support |
| Safari | 14+ | ✅ Full support |
| Edge | 90+ | ✅ Full support |
| Opera | 76+ | ✅ Full support |
| Mobile Chrome | 90+ | ✅ Full support |
| Mobile Safari | 14+ | ✅ Full support |
| IE 11 | — | ❌ Not supported |

### Mobile Notes
- Touch gestures (pinch, pan, long-press) fully supported
- Responsive layout adapts to screen size
- Recommend landscape orientation for better graph viewing
- Mini-map auto-hides on very small screens

### Performance Notes
- Graphs with 100+ nodes work smoothly
- 500+ nodes may require pausing drift animation
- 1000+ nodes recommended to disable animations
- WebGL acceleration used when available

## Troubleshooting

### Graph not loading
**Symptom:** Blank graph area, no nodes visible

**Solutions:**
1. Check browser console for errors
2. Ensure sample data exists in `src/data/sampleData.ts`
3. Try refreshing with cache clear (`Ctrl+Shift+R`)
4. Check if Cytoscape.js loaded correctly

### API errors
**Symptom:** "Failed to fetch" or CORS errors

**Solutions:**
1. **MusicBrainz:** Add proper User-Agent header (already configured)
2. **Deezer:** Uses CORS proxy; may hit rate limits
3. **Spotify:** Ensure redirect URI matches exactly
4. **Last.fm:** Verify API key is correct
5. **Apple Music:** Check JWT token hasn't expired

### Slow performance
**Symptom:** Laggy interactions, slow animations

**Solutions:**
1. Pause drift animation (⏸ button)
2. Switch to simpler layout (circle or hierarchical)
3. Filter out relationship types to reduce edges
4. Close other browser tabs
5. Disable mini-map on low-end devices

### Theme not persisting
**Symptom:** Theme resets on refresh

**Solutions:**
1. Check localStorage is enabled in browser
2. Not in private/incognito mode
3. Clear localStorage and try again:
   ```javascript
   localStorage.removeItem('musicgraph-prefs')
   ```

### Import failing
**Symptom:** "Invalid graph data format" error

**Solutions:**
1. Ensure JSON has both `entities` and `relationships` arrays
2. Check all entities have `id`, `name`, and `type`
3. Check all relationships have `id`, `source`, `target`, and `role`
4. Validate JSON syntax at [jsonlint.com](https://jsonlint.com)

## FAQ

**Q: Can I use this with my own music data?**
A: Yes! Use the Import feature to load any JSON file matching the data format, or modify `sampleData.ts` directly.

**Q: Is the Spotify integration real?**
A: The integration code is complete, but you need to add your own Spotify Client ID and set up OAuth. The "Now Playing" bar in the demo is a mock.

**Q: Why does the graph keep moving?**
A: That's the "drift" animation for a more organic feel. Click the ⏸ button in the controls to pause it.

**Q: Can I embed this in another website?**
A: Yes, build the app and host it, then use an iframe. Or import the Vue components directly into your Vue project.

**Q: How do I add custom relationship types?**
A: Edit `src/types/music.ts` to add new role types, then update the color mappings in `MusicGraph.vue` and `EntityPanel.vue`.

**Q: Does this work offline?**
A: Yes, the core app works offline. API integrations require internet, but imported JSON data works offline.

**Q: Can I use this commercially?**
A: Yes, MIT license allows commercial use. Note that API data may have its own licensing terms.

**Q: How do I contribute?**
A: See the Contributing section below!

## Contributing

Contributions are welcome! Here's how to get started:

### Getting Started
```bash
# Fork and clone the repo
git clone https://github.com/YOUR_USERNAME/music-graph.git
cd music-graph

# Install dependencies
npm install

# Start dev server
npm run dev
```

### Code Style
- **TypeScript** — All new code should be typed
- **Vue 3 Composition API** — Use `<script setup>` syntax
- **Formatting** — Run `npm run lint` before committing
- **Components** — One component per file, PascalCase names
- **CSS** — Scoped styles, use CSS variables for theming

### Pull Request Process
1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run type checking: `npm run type-check`
4. Test in multiple browsers
5. Commit with descriptive message
6. Push and open a PR against `main`

### Areas for Contribution
- 🐛 Bug fixes
- 🌍 Internationalization (i18n)
- ♿ Accessibility improvements
- 📱 Mobile UX enhancements
- 🎨 Theme variants
- 🔌 New API integrations
- 📖 Documentation improvements
- 🧪 Test coverage

### Reporting Issues
Use GitHub Issues with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Browser and OS information
- Screenshots if applicable

## Changelog

### v1.0.0 (Current)
- ✨ Initial release
- 🎨 Interactive force-directed graph visualization
- 🔍 Search functionality
- 📊 Statistics panel
- 🎵 Now Playing mock player
- 🗺️ Mini-map navigation
- 🔀 Multiple layout options (force, hierarchical, circle, clustered)
- 🎯 Path finding between nodes
- 📍 Breadcrumb navigation
- 🎛️ Relationship type filters
- 🌓 Light/dark theme support
- 💾 LocalStorage persistence
- 📤 JSON import/export
- 🖼️ PNG export
- 📱 Touch gesture support
- 🔌 API integrations:
  - MusicBrainz
  - Last.fm
  - Deezer
  - Spotify
  - Apple Music

### Planned
- See Roadmap section

## Roadmap

### Near Term
- [ ] Undo/redo for navigation
- [ ] Keyboard shortcuts panel (press `?`)
- [ ] Node search within graph
- [ ] Edge labels toggle
- [ ] Zoom to selection
- [ ] Shareable URLs with state

### Medium Term
- [ ] Real-time collaborative editing
- [ ] Graph comparison view
- [ ] Timeline slider for historical data
- [ ] Playlist generation from paths
- [ ] More export formats (SVG, PDF)
- [ ] Graph templates

### Long Term
- [ ] 3D graph view (Three.js)
- [ ] AI-powered music recommendations
- [ ] Desktop app (Electron/Tauri)
- [ ] Mobile app (Capacitor)
- [ ] Plugin system
- [ ] Self-hosted backend option

### Community Requests
Open an issue to suggest features!

## Credits

### Libraries
- [Vue.js](https://vuejs.org/) — Progressive JavaScript framework
- [Cytoscape.js](https://js.cytoscape.org/) — Graph theory library
- [cytoscape-fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) — Force-directed layout
- [Vite](https://vitejs.dev/) — Next-generation frontend tooling

### APIs
- [MusicBrainz](https://musicbrainz.org/) — Open music encyclopedia
- [Last.fm](https://www.last.fm/api) — Music discovery service
- [Deezer](https://developers.deezer.com/) — Music streaming platform
- [Spotify](https://developer.spotify.com/) — Music streaming platform
- [Apple Music](https://developer.apple.com/musickit/) — Apple's music service

### Inspiration
- [Obsidian](https://obsidian.md/) — Graph view for notes
- [Cider](https://cider.sh/) — Apple Music client
- [Every Noise at Once](https://everynoise.com/) — Genre exploration
- [MusicMap](https://musicmap.info/) — Genre genealogy

### Icons & Fonts
- Emoji icons from system fonts
- [Inter](https://rsms.me/inter/) — UI font family

### Sample Data
Demo data based on real artist relationships around JAY-Z, Rihanna, and Kanye West collaborations.

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
