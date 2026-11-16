/**
 * Netlify Function — calendrier des sorties (produits TCG FR/US et extensions japonaises).
 * Disponible à /.netlify/functions/fetch-releases
 *
 * Relaie le calendrier iCal public de PokéCardex, que le navigateur ne peut pas lire
 * directement (pas d'en-tête CORS).
 */

const SOURCE = 'https://www.pokecardex.com/calendrier/sorties.ics';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    const res = await fetch(SOURCE, {
      headers: { 'User-Agent': 'Dexup/1.0 (release calendar)', Accept: 'text/calendar, */*' },
      signal: AbortSignal.timeout(8000),
    });
    const body = res.ok ? await res.text() : '';
    if (!body.includes('BEGIN:VCALENDAR')) throw new Error(`HTTP ${res.status}`);
    return {
      statusCode: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // CDN : 1 h
      },
      body,
    };
  } catch (e) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: `Calendrier indisponible (${e.message})` }) };
  }
};
