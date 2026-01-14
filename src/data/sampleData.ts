import type { MusicGraph } from '../types/music'

// Generate avatar URL using DiceBear API
const avatar = (name: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=c44dff,ff6b9d,4d79ff,50c878&backgroundType=gradientLinear`

// Sample data centered around "Run This Town" and connected artists
export const sampleMusicGraph: MusicGraph = {
  entities: [
    // Tracks
    { id: 'track-run-this-town', name: 'Run This Town', type: 'track' },
    { id: 'track-umbrella', name: 'Umbrella', type: 'track' },
    { id: 'track-diamonds', name: 'Diamonds', type: 'track' },
    { id: 'track-empire-state', name: 'Empire State of Mind', type: 'track' },
    { id: 'track-holy-grail', name: 'Holy Grail', type: 'track' },
    { id: 'track-stronger', name: 'Stronger', type: 'track' },
    { id: 'track-all-of-lights', name: 'All of the Lights', type: 'track' },
    { id: 'track-ni--as-in-paris', name: 'Ni**as in Paris', type: 'track' },
    { id: 'track-diamonds-remix', name: 'Diamonds (Remix)', type: 'track' },

    // Artists (with images)
    { id: 'artist-jayz', name: 'JAY-Z', type: 'artist', image: avatar('JAY-Z') },
    { id: 'artist-rihanna', name: 'Rihanna', type: 'artist', image: avatar('Rihanna') },
    { id: 'artist-kanye', name: 'Kanye West', type: 'artist', image: avatar('Kanye West') },
    { id: 'artist-noid', name: 'No I.D.', type: 'artist', image: avatar('No ID') },
    { id: 'artist-alicia', name: 'Alicia Keys', type: 'artist', image: avatar('Alicia Keys') },
    { id: 'artist-timberlake', name: 'Justin Timberlake', type: 'artist', image: avatar('Justin Timberlake') },
    { id: 'artist-theDream', name: 'The-Dream', type: 'artist', image: avatar('The Dream') },
    { id: 'artist-tricky', name: 'Tricky Stewart', type: 'artist', image: avatar('Tricky Stewart') },
    { id: 'artist-stargate', name: 'Stargate', type: 'artist', image: avatar('Stargate') },
    { id: 'artist-benny', name: 'Benny Blanco', type: 'artist', image: avatar('Benny Blanco') },
    { id: 'artist-sia', name: 'Sia', type: 'artist', image: avatar('Sia') },
    { id: 'artist-fergie', name: 'Fergie', type: 'artist', image: avatar('Fergie') },
    { id: 'artist-kid-cudi', name: 'Kid Cudi', type: 'artist', image: avatar('Kid Cudi') },

    // Albums
    { id: 'album-blueprint3', name: 'The Blueprint 3', type: 'album' },
    { id: 'album-good-girl', name: 'Good Girl Gone Bad', type: 'album' },
    { id: 'album-unapologetic', name: 'Unapologetic', type: 'album' },
    { id: 'album-graduation', name: 'Graduation', type: 'album' },
    { id: 'album-mbdtf', name: 'My Beautiful Dark Twisted Fantasy', type: 'album' },
    { id: 'album-watch-throne', name: 'Watch the Throne', type: 'album' },
    { id: 'album-magna-carta', name: 'Magna Carta Holy Grail', type: 'album' },

    // Labels
    { id: 'label-rocnation', name: 'Roc Nation', type: 'label' },
    { id: 'label-good-music', name: 'GOOD Music', type: 'label' },
    { id: 'label-def-jam', name: 'Def Jam', type: 'label' },
  ],

  relationships: [
    // Run This Town relationships
    { id: 'rel-1', source: 'track-run-this-town', target: 'artist-jayz', role: 'primary_artist' },
    { id: 'rel-2', source: 'track-run-this-town', target: 'artist-rihanna', role: 'featured' },
    { id: 'rel-3', source: 'track-run-this-town', target: 'artist-rihanna', role: 'vocals' },
    { id: 'rel-4', source: 'track-run-this-town', target: 'artist-kanye', role: 'featured' },
    { id: 'rel-5', source: 'track-run-this-town', target: 'artist-kanye', role: 'producer' },
    { id: 'rel-6', source: 'track-run-this-town', target: 'artist-noid', role: 'producer' },
    { id: 'rel-7', source: 'album-blueprint3', target: 'track-run-this-town', role: 'contains' },

    // Umbrella relationships
    { id: 'rel-8', source: 'track-umbrella', target: 'artist-rihanna', role: 'primary_artist' },
    { id: 'rel-9', source: 'track-umbrella', target: 'artist-jayz', role: 'featured' },
    { id: 'rel-10', source: 'track-umbrella', target: 'artist-theDream', role: 'songwriter' },
    { id: 'rel-11', source: 'track-umbrella', target: 'artist-tricky', role: 'producer' },
    { id: 'rel-12', source: 'album-good-girl', target: 'track-umbrella', role: 'contains' },

    // Diamonds relationships
    { id: 'rel-13', source: 'track-diamonds', target: 'artist-rihanna', role: 'primary_artist' },
    { id: 'rel-14', source: 'track-diamonds', target: 'artist-stargate', role: 'producer' },
    { id: 'rel-15', source: 'track-diamonds', target: 'artist-benny', role: 'producer' },
    { id: 'rel-16', source: 'track-diamonds', target: 'artist-sia', role: 'songwriter' },
    { id: 'rel-17', source: 'album-unapologetic', target: 'track-diamonds', role: 'contains' },

    // Diamonds Remix
    { id: 'rel-18', source: 'track-diamonds-remix', target: 'artist-rihanna', role: 'primary_artist' },
    { id: 'rel-19', source: 'track-diamonds-remix', target: 'artist-kanye', role: 'featured' },

    // Empire State of Mind
    { id: 'rel-20', source: 'track-empire-state', target: 'artist-jayz', role: 'primary_artist' },
    { id: 'rel-21', source: 'track-empire-state', target: 'artist-alicia', role: 'featured' },
    { id: 'rel-22', source: 'track-empire-state', target: 'artist-alicia', role: 'vocals' },
    { id: 'rel-23', source: 'track-empire-state', target: 'artist-noid', role: 'producer' },
    { id: 'rel-24', source: 'album-blueprint3', target: 'track-empire-state', role: 'contains' },

    // Holy Grail
    { id: 'rel-25', source: 'track-holy-grail', target: 'artist-jayz', role: 'primary_artist' },
    { id: 'rel-26', source: 'track-holy-grail', target: 'artist-timberlake', role: 'featured' },
    { id: 'rel-27', source: 'track-holy-grail', target: 'artist-timberlake', role: 'vocals' },
    { id: 'rel-28', source: 'album-magna-carta', target: 'track-holy-grail', role: 'contains' },

    // Stronger
    { id: 'rel-29', source: 'track-stronger', target: 'artist-kanye', role: 'primary_artist' },
    { id: 'rel-30', source: 'track-stronger', target: 'artist-kanye', role: 'producer' },
    { id: 'rel-31', source: 'album-graduation', target: 'track-stronger', role: 'contains' },

    // All of the Lights
    { id: 'rel-32', source: 'track-all-of-lights', target: 'artist-kanye', role: 'primary_artist' },
    { id: 'rel-33', source: 'track-all-of-lights', target: 'artist-rihanna', role: 'featured' },
    { id: 'rel-34', source: 'track-all-of-lights', target: 'artist-kid-cudi', role: 'featured' },
    { id: 'rel-35', source: 'track-all-of-lights', target: 'artist-fergie', role: 'featured' },
    { id: 'rel-36', source: 'track-all-of-lights', target: 'artist-alicia', role: 'featured' },
    { id: 'rel-37', source: 'album-mbdtf', target: 'track-all-of-lights', role: 'contains' },

    // Ni**as in Paris
    { id: 'rel-38', source: 'track-ni--as-in-paris', target: 'artist-kanye', role: 'primary_artist' },
    { id: 'rel-39', source: 'track-ni--as-in-paris', target: 'artist-jayz', role: 'primary_artist' },
    { id: 'rel-40', source: 'album-watch-throne', target: 'track-ni--as-in-paris', role: 'contains' },

    // Label relationships
    { id: 'rel-41', source: 'artist-jayz', target: 'label-rocnation', role: 'signed_to' },
    { id: 'rel-42', source: 'artist-rihanna', target: 'label-rocnation', role: 'signed_to' },
    { id: 'rel-43', source: 'artist-kanye', target: 'label-good-music', role: 'signed_to' },
    { id: 'rel-44', source: 'artist-kanye', target: 'label-def-jam', role: 'signed_to' },
    { id: 'rel-45', source: 'artist-kid-cudi', target: 'label-good-music', role: 'signed_to' },
    { id: 'rel-46', source: 'artist-noid', target: 'label-def-jam', role: 'signed_to' },
  ]
}
