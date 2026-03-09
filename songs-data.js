const RAW_LISTS = {
  pop: `
https://music.youtube.com/watch?v=e-ORhEE9VVg | 2012 | Blank Space - Taylor Swift
https://music.youtube.com/watch?v=lp-EO5I60KA | 2014 | Thinking Out Loud - Ed Sheeran
https://music.youtube.com/watch?v=YQHsXMglC9A | 2015 | Hello - Adele
https://music.youtube.com/watch?v=fRh_vgS2dFE | 2010 | Sorry - Justin Bieber
https://music.youtube.com/watch?v=RUQl6YcMalg | 2009 | Bad Romance - Lady Gaga
https://music.youtube.com/watch?v=09R8_2nJtjg | 2013 | Counting Stars - OneRepublic
`,
  rock: `
https://music.youtube.com/watch?v=fJ9rUzIMcZQ | 1975 | Bohemian Rhapsody - Queen
https://music.youtube.com/watch?v=kXYiU_JCYtU | 2003 | Numb - Linkin Park
https://music.youtube.com/watch?v=hTWKbfoikeg | 1991 | Smells Like Teen Spirit - Nirvana
https://music.youtube.com/watch?v=Zi_XLOBDo_Y | 1987 | Sweet Child O' Mine - Guns N' Roses
https://music.youtube.com/watch?v=ktvTqknDobU | 2012 | Radioactive - Imagine Dragons
https://music.youtube.com/watch?v=Soa3gO7tL-c | 2005 | Fix You - Coldplay
`,
  hiphop: `
https://music.youtube.com/watch?v=eVTXPUF4Oz4 | 2010 | Love The Way You Lie - Eminem ft. Rihanna
https://music.youtube.com/watch?v=uelHwf8o7_U | 2013 | Love Me Again - John Newman
https://music.youtube.com/watch?v=rYEDA3JcQqw | 2002 | Lose Yourself - Eminem
https://music.youtube.com/watch?v=tvTRZJ-4EyI | 2018 | God's Plan - Drake
https://music.youtube.com/watch?v=JGwWNGJdvx8 | 2017 | Shape of You - Ed Sheeran
`,
  latino: `
https://music.youtube.com/watch?v=OPf0YbXqDm0 | 2017 | Despacito - Luis Fonsi
https://music.youtube.com/watch?v=wnJ6LuUFpMo | 2005 | Gasolina - Daddy Yankee
https://music.youtube.com/watch?v=NUsoVlDFqZg | 2017 | Mi Gente - J Balvin
https://music.youtube.com/watch?v=pRpeEdMmmQ0 | 2011 | Danza Kuduro - Don Omar
https://music.youtube.com/watch?v=weRHyjj34ZE | 2022 | Despechá - Rosalía
https://music.youtube.com/watch?v=4I25nV9hXGA | 2019 | Con Calma - Daddy Yankee
`,
  dance: `
https://music.youtube.com/watch?v=IcrbM1l_BoI | 2010 | Wake Me Up - Avicii
https://music.youtube.com/watch?v=5NV6Rdv1a3I | 2011 | Get Lucky - Daft Punk
https://music.youtube.com/watch?v=60ItHLz5WEA | 2015 | Faded - Alan Walker
https://music.youtube.com/watch?v=PT2_F-1esPk | 2013 | Animals - Martin Garrix
https://music.youtube.com/watch?v=RBumgq5yVrA | 2015 | Lean On - Major Lazer
`,
  espana: `
https://music.youtube.com/watch?v=eM-2iC1V7fQ | 2023 | Cómo Dormiste? - Rels B
https://music.youtube.com/watch?v=2Rht3gM9e1k | 2019 | Aute Cuture - Rosalía
https://music.youtube.com/watch?v=hf4kz0eFh4E | 1997 | La Flaca - Jarabe de Palo
https://music.youtube.com/watch?v=tbm16PA7V4s | 2001 | Ave María - David Bisbal
https://music.youtube.com/watch?v=nP9qa0q5lpk | 2020 | TKN - Rosalía ft Travis Scott
https://music.youtube.com/watch?v=itxJ7z8mLzA | 2021 | Mon Amour - Zzoilo, Aitana
`,
};

export const GENRE_META = {
  pop: { key: 'pop', label: 'POP', emoji: '🎤' },
  rock: { key: 'rock', label: 'ROCK', emoji: '🎸' },
  hiphop: { key: 'hiphop', label: 'HIP HOP', emoji: '🔥' },
  latino: { key: 'latino', label: 'LATINO', emoji: '🌴' },
  dance: { key: 'dance', label: 'DANCE', emoji: '💿' },
  espana: { key: 'espana', label: 'ESPAÑA', emoji: '🇪🇸' },
};

export function parseSongs(raw, genreKey) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [urlPart, yearPart, ...titleParts] = line.split('|').map((v) => v.trim());
      const title = titleParts.join(' | ').trim();
      if (!urlPart || !yearPart || !title) return null;
      const songId = `${genreKey}-${btoa(urlPart).replace(/=/g, '').slice(-10)}-${index}`;
      return {
        id: songId,
        url: urlPart,
        year: Number(yearPart),
        title,
        genre: genreKey,
      };
    })
    .filter(Boolean);
}

export function getSongsByGenres(activeGenres = []) {
  const genreKeys = activeGenres.length ? activeGenres : ['pop'];
  const byUrl = new Map();
  for (const key of genreKeys) {
    const parsed = parseSongs(RAW_LISTS[key] || '', key);
    for (const song of parsed) {
      if (!byUrl.has(song.url)) byUrl.set(song.url, song);
    }
  }
  return Array.from(byUrl.values());
}
