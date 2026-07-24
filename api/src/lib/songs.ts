import { Song } from '../../../shared/scoring';

// The daily rotation lives server-side ONLY, so the answer (and the future
// schedule) never ships to the browser. GET /api/daily reveals just the
// current title/artist; the BPM comes back only with a scored run.
// BPMs verified against Tunebat/SongBPM/GetSongBPM et al. (2026-07-22). Songs
// with a genuine half/double-time feel (Hey Ya!, Wonderwall, Umbrella,
// Hotel California, Footloose…) store the felt clap-along tempo — the
// octave-aware scoring below accepts either feel, so the choice only affects
// the "actual BPM" shown on reveal. Never reorder or remove entries: a song's
// index decides which day it appears, so edits in place or appends only.
//
// trackId is the iTunes track whose 30s preview the app streams (lookup?id=
// is exact — no fuzzy search at runtime). New songs REQUIRE a verified
// trackId whose preview is the same recording the BPM was checked against:
//   https://itunes.apple.com/search?term=<title+artist>&media=music

export const SONGS: Song[] = [
  { title: 'Toxic', artist: 'Britney Spears', bpm: 143, trackId: 251948354 },
  { title: 'Billie Jean', artist: 'Michael Jackson', bpm: 117, trackId: 269573364 },
  { title: 'Dancing Queen', artist: 'ABBA', bpm: 101, trackId: 1422648513 },
  { title: "Stayin' Alive", artist: 'Bee Gees', bpm: 104, trackId: 1440900114 },
  { title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', bpm: 115, trackId: 943946671 },
  { title: 'Shape of You', artist: 'Ed Sheeran', bpm: 96, trackId: 1193701392 },
  { title: 'Rolling in the Deep', artist: 'Adele', bpm: 105, trackId: 1544491233 },
  { title: 'Hey Ya!', artist: 'OutKast', bpm: 158, trackId: 1032178989 },
  { title: 'Beat It', artist: 'Michael Jackson', bpm: 139, trackId: 269573341 },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', bpm: 117, trackId: 1440783625 },
  { title: 'Take On Me', artist: 'a-ha', bpm: 169, trackId: 380907765 },
  { title: 'Wonderwall', artist: 'Oasis', bpm: 87, trackId: 1517447333 },
  { title: 'I Want It That Way', artist: 'Backstreet Boys', bpm: 99, trackId: 283567164 },
  { title: 'Poker Face', artist: 'Lady Gaga', bpm: 119, trackId: 1577631231 },
  { title: 'Bad Guy', artist: 'Billie Eilish', bpm: 135, trackId: 1450695739 },
  { title: 'Blinding Lights', artist: 'The Weeknd', bpm: 171, trackId: 1488408568 },
  { title: 'Happy', artist: 'Pharrell Williams', bpm: 160, trackId: 863835363 },
  { title: 'Shake It Off', artist: 'Taylor Swift', bpm: 160, trackId: 1440933651 },
  { title: "Can't Stop the Feeling!", artist: 'Justin Timberlake', bpm: 113, trackId: 1154239184 },
  { title: 'Seven Nation Army', artist: 'The White Stripes', bpm: 124, trackId: 1533513537 },
  { title: 'Superstition', artist: 'Stevie Wonder', bpm: 100, trackId: 1440808985 },
  { title: 'I Will Survive', artist: 'Gloria Gaynor', bpm: 117, trackId: 1443818368 },
  { title: 'Like a Prayer', artist: 'Madonna', bpm: 111, trackId: 83445997 },
  { title: "Livin' on a Prayer", artist: 'Bon Jovi', bpm: 123, trackId: 1422955211 },
  { title: "Don't Stop Believin'", artist: 'Journey', bpm: 119, trackId: 169003415 },
  { title: "Hips Don't Lie", artist: 'Shakira', bpm: 100, trackId: 1817217063 },
  { title: 'Get Lucky', artist: 'Daft Punk', bpm: 116, trackId: 617154366 },
  { title: 'Firework', artist: 'Katy Perry', bpm: 124, trackId: 716192625 },
  { title: 'Viva la Vida', artist: 'Coldplay', bpm: 138, trackId: 1122773680 },
  { title: 'Crazy in Love', artist: 'Beyoncé', bpm: 99, trackId: 201274644 },
  { title: 'We Will Rock You', artist: 'Queen', bpm: 81, trackId: 1440651216 },
  { title: 'Africa', artist: 'Toto', bpm: 92, trackId: 185717604 },
  { title: 'Mr. Brightside', artist: 'The Killers', bpm: 148, trackId: 1440891171 },
  { title: 'Gangnam Style', artist: 'PSY', bpm: 132, trackId: 1445144527 },
  { title: 'Sweet Caroline', artist: 'Neil Diamond', bpm: 127, trackId: 1422721989 },
  { title: '...Baby One More Time', artist: 'Britney Spears', bpm: 93, trackId: 273143820 },
  { title: 'My Girl', artist: 'The Temptations', bpm: 105, trackId: 1423301921 },
  { title: "U Can't Touch This", artist: 'MC Hammer', bpm: 133, trackId: 724647729 },
  { title: 'Respect', artist: 'Aretha Franklin', bpm: 115, trackId: 937107838 },
  { title: 'Ice Ice Baby', artist: 'Vanilla Ice', bpm: 116, trackId: 716691562 },
  { title: 'Twist and Shout', artist: 'The Beatles', bpm: 124, trackId: 1441165136 },
  { title: 'What Is Love', artist: 'Haddaway', bpm: 124, trackId: 1731384547 },
  { title: 'Brown Eyed Girl', artist: 'Van Morrison', bpm: 150, trackId: 1838782096 },
  { title: 'Macarena', artist: 'Los del Río', bpm: 103, trackId: 258647542 },
  { title: 'I Heard It Through the Grapevine', artist: 'Marvin Gaye', bpm: 117, trackId: 1444106658 },
  { title: 'Wannabe', artist: 'Spice Girls', bpm: 110, trackId: 1573849255 },
  { title: "(I Can't Get No) Satisfaction", artist: 'The Rolling Stones', bpm: 136, trackId: 1440765093 },
  { title: 'Barbie Girl', artist: 'Aqua', bpm: 130, trackId: 1443758761 },
  { title: 'Hey Jude', artist: 'The Beatles', bpm: 74, trackId: 1441133277 },
  { title: 'Believe', artist: 'Cher', bpm: 133, trackId: 73273491 },
  { title: 'Jolene', artist: 'Dolly Parton', bpm: 111, trackId: 1062400330 },
  { title: 'Blue (Da Ba Dee)', artist: 'Eiffel 65', bpm: 128, trackId: 257425340 },
  { title: 'Mamma Mia', artist: 'ABBA', bpm: 137, trackId: 1440861294 },
  { title: 'No Scrubs', artist: 'TLC', bpm: 93, trackId: 298575248 },
  { title: 'Night Fever', artist: 'Bee Gees', bpm: 109, trackId: 1445668465 },
  { title: "It's My Life", artist: 'Bon Jovi', bpm: 120, trackId: 1440677670 },
  { title: 'Y.M.C.A.', artist: 'Village People', bpm: 127, trackId: 1440825374 },
  { title: 'Lose Yourself', artist: 'Eminem', bpm: 86, trackId: 1440903439 },
  { title: 'September', artist: 'Earth, Wind & Fire', bpm: 126, trackId: 1456623340 },
  { title: 'In da Club', artist: '50 Cent', bpm: 90, trackId: 1440907550 },
  { title: 'Hotel California', artist: 'Eagles', bpm: 74, trackId: 635770202 },
  { title: 'Yeah!', artist: 'Usher ft. Lil Jon & Ludacris', bpm: 105, trackId: 386153478 },
  { title: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd', bpm: 98, trackId: 1413948381 },
  { title: 'Since U Been Gone', artist: 'Kelly Clarkson', bpm: 131, trackId: 275765380 },
  { title: 'Crocodile Rock', artist: 'Elton John', bpm: 150, trackId: 1440926343 },
  { title: 'SexyBack', artist: 'Justin Timberlake', bpm: 117, trackId: 400946435 },
  { title: 'Thriller', artist: 'Michael Jackson', bpm: 118, trackId: 269573303 },
  { title: 'Umbrella', artist: 'Rihanna ft. Jay-Z', bpm: 87, trackId: 1441154437 },
  { title: 'Girls Just Want to Have Fun', artist: 'Cyndi Lauper', bpm: 120, trackId: 400603693 },
  { title: 'Single Ladies (Put a Ring on It)', artist: 'Beyoncé', bpm: 97, trackId: 296016899 },
  { title: 'Like a Virgin', artist: 'Madonna', bpm: 120, trackId: 80815215 },
  { title: 'I Gotta Feeling', artist: 'The Black Eyed Peas', bpm: 128, trackId: 1440769310 },
  { title: 'Sweet Dreams (Are Made of This)', artist: 'Eurythmics', bpm: 126, trackId: 255966421 },
  { title: 'Party in the U.S.A.', artist: 'Miley Cyrus', bpm: 96, trackId: 1445007713 },
  { title: 'Every Breath You Take', artist: 'The Police', bpm: 117, trackId: 1440882897 },
  { title: 'Call Me Maybe', artist: 'Carly Rae Jepsen', bpm: 120, trackId: 1637507328 },
  { title: 'Eye of the Tiger', artist: 'Survivor', bpm: 109, trackId: 254685026 },
  { title: 'Counting Stars', artist: 'OneRepublic', bpm: 122, trackId: 1471704175 },
  { title: 'I Wanna Dance with Somebody', artist: 'Whitney Houston', bpm: 119, trackId: 840431935 },
  { title: 'All About That Bass', artist: 'Meghan Trainor', bpm: 134, trackId: 1351343202 },
  { title: 'Footloose', artist: 'Kenny Loggins', bpm: 174, trackId: 405600299 },
  { title: 'Despacito', artist: 'Luis Fonsi ft. Daddy Yankee', bpm: 89, trackId: 1447401620 },
  { title: 'Wake Me Up Before You Go-Go', artist: 'Wham!', bpm: 81, trackId: 1466274459 },
  { title: 'Havana', artist: 'Camila Cabello', bpm: 105, trackId: 1321217032 },
  { title: 'Never Gonna Give You Up', artist: 'Rick Astley', bpm: 113, trackId: 1773293184 },
  { title: 'Watermelon Sugar', artist: 'Harry Styles', bpm: 95, trackId: 1485802967 },
  { title: 'Walking on Sunshine', artist: 'Katrina & The Waves', bpm: 110, trackId: 724739482 },
  { title: "Don't Start Now", artist: 'Dua Lipa', bpm: 124, trackId: 1484636829 },
  { title: 'Another One Bites the Dust', artist: 'Queen', bpm: 110, trackId: 1440650719 },
  { title: 'Levitating', artist: 'Dua Lipa', bpm: 103, trackId: 1538003843 },
  { title: "Don't Stop Me Now", artist: 'Queen', bpm: 156, trackId: 1440650733 },
  { title: 'Espresso', artist: 'Sabrina Carpenter', bpm: 104, trackId: 1746801012 },
];

export function songForDay(day: number): Song {
  const i = (((day - 1) % SONGS.length) + SONGS.length) % SONGS.length;
  return SONGS[i];
}
