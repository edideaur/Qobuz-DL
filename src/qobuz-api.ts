import { md5 } from '@noble/hashes/legacy';
import { bytesToHex } from '@noble/hashes/utils';

export type TokenCountry = { code: string; token: string };

// Fill this to enable per-country tokens. If empty, QOBUZ_AUTH_TOKENS is used.
// Country codes: ISO 3166-1 alpha-2 (https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2)
export const tokenCountriesMap: TokenCountry[] = [];

export interface Env {
    QOBUZ_API_BASE: string;
    QOBUZ_APP_ID: string;
    QOBUZ_SECRET: string;
    QOBUZ_AUTH_TOKENS: string;
    CORS_PROXY?: string;
}

function getRandomToken(env: Env): string {
    if (tokenCountriesMap.length > 0) return tokenCountriesMap[0].token;
    const tokens = JSON.parse(env.QOBUZ_AUTH_TOKENS) as string[];
    return tokens[Math.floor(Math.random() * tokens.length)];
}

function getToken(country: string | null | undefined, env: Env): string {
    if (!country) return getRandomToken(env);
    return (tokenCountriesMap as TokenCountry[]).find((c) => c.code.toUpperCase() === country.toUpperCase())?.token ?? getRandomToken(env);
}

function checkEnv(env: Env): void {
    if (!env.QOBUZ_APP_ID) throw new Error('Missing QOBUZ_APP_ID');
    if (!env.QOBUZ_AUTH_TOKENS) throw new Error('Missing QOBUZ_AUTH_TOKENS');
    if (!env.QOBUZ_SECRET) throw new Error('Missing QOBUZ_SECRET');
    if (!env.QOBUZ_API_BASE) throw new Error('Missing QOBUZ_API_BASE');
}

async function apiFetch(url: URL, env: Env, token: string): Promise<any> {
    const fetchUrl = env.CORS_PROXY ? env.CORS_PROXY + encodeURIComponent(url.toString()) : url.toString();
    const headers: Record<string, string> = {
        'x-app-id': env.QOBUZ_APP_ID,
        'x-user-auth-token': token
    };
    if (env.CORS_PROXY) headers['User-Agent'] = 'Qobuz-DL';
    const response = await fetch(fetchUrl, { headers });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Qobuz API ${response.status}: ${text}`);
    }
    return response.json();
}

const ALBUM_URL_RE = /https:\/\/(play|open)\.qobuz\.com\/album\/([a-zA-Z0-9]+)/;
const TRACK_URL_RE = /https:\/\/(play|open)\.qobuz\.com\/track\/(\d+)/;
const ARTIST_URL_RE = /https:\/\/(play|open)\.qobuz\.com\/artist\/(\d+)/;

export async function search(query: string, limit: number, offset: number, country: string | null | undefined, env: Env) {
    checkEnv(env);
    const token = getToken(country, env);

    let id: string | null = null;
    let switchTo: string | null = null;
    const albumMatch = query.trim().match(ALBUM_URL_RE);
    const trackMatch = query.trim().match(TRACK_URL_RE);
    const artistMatch = query.trim().match(ARTIST_URL_RE);
    if (albumMatch) { id = albumMatch[2]; switchTo = 'albums'; }
    else if (trackMatch) { id = trackMatch[2]; switchTo = 'tracks'; }
    else if (artistMatch) { id = artistMatch[2]; switchTo = 'artists'; }

    const url = new URL(env.QOBUZ_API_BASE + 'catalog/search');
    url.searchParams.set('query', id ?? query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    const data = await apiFetch(url, env, token);
    return { ...data, switchTo };
}

export async function getArtist(artistId: string, country: string | null | undefined, env: Env) {
    checkEnv(env);
    const token = getToken(country, env);
    const url = new URL(env.QOBUZ_API_BASE + 'artist/page');
    url.searchParams.set('artist_id', artistId);
    url.searchParams.set('sort', 'release_date');
    return apiFetch(url, env, token);
}

export async function getArtistReleases(
    artist_id: string,
    release_type: string,
    limit: number,
    offset: number,
    track_size: number,
    country: string | null | undefined,
    env: Env
) {
    checkEnv(env);
    const token = getToken(country, env);
    const url = new URL(env.QOBUZ_API_BASE + 'artist/getReleasesList');
    url.searchParams.set('artist_id', artist_id);
    url.searchParams.set('release_type', release_type);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('track_size', String(track_size));
    url.searchParams.set('sort', 'release_date');
    return apiFetch(url, env, token);
}

export async function getAlbumInfo(album_id: string, country: string | null | undefined, env: Env) {
    checkEnv(env);
    const token = getToken(country, env);
    const url = new URL(env.QOBUZ_API_BASE + 'album/get');
    url.searchParams.set('album_id', album_id);
    url.searchParams.set('extra', 'track_ids');
    return apiFetch(url, env, token);
}

export async function getDownloadURL(trackID: number, quality: string, country: string | null | undefined, env: Env) {
    checkEnv(env);
    const token = getToken(country, env);
    const timestamp = Math.floor(Date.now() / 1000);
    const r_sig = `trackgetFileUrlformat_id${quality}intentstreamtrack_id${trackID}${timestamp}${env.QOBUZ_SECRET}`;
    const r_sig_hashed = bytesToHex(md5(r_sig));
    const url = new URL(env.QOBUZ_API_BASE + 'track/getFileUrl');
    url.searchParams.set('format_id', quality);
    url.searchParams.set('intent', 'stream');
    url.searchParams.set('track_id', String(trackID));
    url.searchParams.set('request_ts', String(timestamp));
    url.searchParams.set('request_sig', r_sig_hashed);
    const data = await apiFetch(url, env, token);
    return data.url;
}

export function getCountries() {
    return (tokenCountriesMap as TokenCountry[]).map((c) => c.code);
}
