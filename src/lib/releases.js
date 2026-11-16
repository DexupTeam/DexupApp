// Calendrier des sorties : produits TCG français et américains, extensions japonaises.
// Source : calendrier iCal public de PokéCardex, relayé par la fonction Netlify fetch-releases.
import { getCachedRaw, setCached } from '../utils/cache';

const KEY = 'releases';
const MAX_AGE = 6 * 60 * 60 * 1000; // le calendrier bouge peu : 6 h
export const RELEASES_SOURCE = 'pokecardex.com';

// Une ligne iCal trop longue est coupée et reprend par une espace ; le texte échappe \n , ; et \.
const unfold = (ics) => ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
const unescape = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

// « 🇫🇷🇺🇸 Collection… » → { langs: ['FR', 'US'], name: 'Collection…' }
const FLAGS = /^((?:[\u{1F1E6}-\u{1F1FF}]{2}\s*)+)/u;
function splitFlags(line) {
  const m = line.match(FLAGS);
  if (!m) return { langs: [], name: line.trim() };
  const langs = [...m[1].matchAll(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu)]
    .map(([, a, b]) => String.fromCharCode(a.codePointAt(0) - 0x1f1e6 + 65, b.codePointAt(0) - 0x1f1e6 + 65));
  return { langs, name: line.slice(m[0].length).trim() };
}

/** iCal → [{ date: 'AAAA-MM-JJ', items: [{ name, langs }] }], une entrée par jour, triées par date. */
export function parseReleases(ics) {
  const byDate = {};
  for (const block of unfold(ics).split('BEGIN:VEVENT').slice(1)) {
    const field = (name) => {
      const m = block.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, 'm'));
      return m ? unescape(m[1].trim()) : '';
    };
    const start = field('DTSTART').match(/^(\d{4})(\d{2})(\d{2})/);
    if (!start) continue;
    const date = `${start[1]}-${start[2]}-${start[3]}`;
    const japanese = /japon/i.test(field('CATEGORIES'));
    // La description liste un produit par ligne ; pour le Japon, elle commence par le nom de la catégorie.
    const lines = field('DESCRIPTION').split('\n').map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^sorties? /i.test(l));
    const items = (lines.length ? lines : [field('SUMMARY').replace(/^Japon — /, '')])
      .map(splitFlags)
      .map((item) => (japanese ? { ...item, langs: ['JP'] } : item));
    (byDate[date] ||= []).push(...items);
  }
  return Object.entries(byDate)
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function loadReleases() {
  const hit = await getCachedRaw(KEY);
  if (hit?.data?.length && Date.now() - hit.ts < MAX_AGE) return hit.data;
  try {
    const res = await fetch('/.netlify/functions/fetch-releases', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const releases = parseReleases(await res.text());
    if (!releases.length) throw new Error('empty');
    await setCached(KEY, releases);
    return releases;
  } catch (e) {
    if (hit?.data?.length) return hit.data; // hors ligne : dernier calendrier connu
    throw e;
  }
}

const today = () => new Date().toISOString().slice(0, 10);
export const isUpcoming = (release) => release.date >= today();

export function formatReleaseDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}
