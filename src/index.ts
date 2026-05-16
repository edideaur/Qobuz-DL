import { Env, search, getAlbumInfo, getArtist, getArtistReleases, getDownloadURL, getCountries } from './qobuz-api';
import z from 'zod';

const ALLOWED_ORIGINS = new Set([
    'https://monochrome.tf',
    'https://monochrome.pages.dev',
    'https://monochrome.samdy.com',
    'https://mono.kennyy.com.br',
    'https://lossless.wtf',
    'http://localhosr:3000',
    'https://geeked.wtf'
]);

function corsHeaders(origin: string | null): Record<string, string> {
    if (!origin) return {};
    const allowed = ALLOWED_ORIGINS.has(origin) || origin.endsWith('.monochrome.pages.dev');
    if (!allowed) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Vary': 'Origin'
    };
}

function json(data: unknown, status = 200, origin: string | null = null) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
    });
}

function err(error: any, status = 400, origin: string | null = null) {
    return json({ success: false, error: error?.errors ?? error?.message ?? String(error) }, status, origin);
}

const schemas = {
    getMusic: z.object({
        q: z.string().min(1),
        offset: z.preprocess((a) => parseInt(a as string), z.number().min(0).max(1000).default(0))
    }),
    getAlbum: z.object({
        album_id: z.string().min(1)
    }),
    getArtist: z.object({
        artist_id: z.string().min(1)
    }),
    getReleases: z.object({
        artist_id: z.string().min(1),
        release_type: z.enum(['album', 'live', 'compilation', 'epSingle', 'download']).default('album'),
        track_size: z.preprocess((a) => parseInt(a as string), z.number().positive().default(1000)),
        offset: z.preprocess((a) => parseInt(a as string), z.number().min(0).default(0)),
        limit: z.preprocess((a) => parseInt(a as string), z.number().positive().default(10))
    }),
    downloadMusic: z.object({
        track_id: z.preprocess((a) => parseInt(a as string), z.number().min(0)),
        quality: z.enum(['27', '7', '6', '5']).default('27')
    }),
    track: z.object({
        q: z.string().min(1),
        quality: z.enum(['27', '7', '6', '5']).default('27')
    })
};

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        const origin = request.headers.get('Origin');

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        if (path === '/') {
            return Response.redirect('https://monochrome.tf', 302);
        }

        if (request.method !== 'GET') {
            return json({ error: 'Method not allowed' }, 405, origin);
        }

        const country = request.headers.get('Token-Country');
        const params = Object.fromEntries(url.searchParams);

        try {
            if (path === '/api/get-music') {
                const { q, offset } = schemas.getMusic.parse(params);
                const data = await search(q, 10, offset, country, env);
                return json({ success: true, data }, 200, origin);
            }

            if (path === '/api/get-album') {
                const { album_id } = schemas.getAlbum.parse(params);
                const data = await getAlbumInfo(album_id, country, env);
                return json({ success: true, data }, 200, origin);
            }

            if (path === '/api/get-artist') {
                const { artist_id } = schemas.getArtist.parse(params);
                const artist = await getArtist(artist_id, country, env);
                return json({ success: true, data: { artist } }, 200, origin);
            }

            if (path === '/api/get-releases') {
                const { artist_id, release_type, track_size, offset, limit } = schemas.getReleases.parse(params);
                const data = await getArtistReleases(artist_id, release_type, limit, offset, track_size, country, env);
                return json({ success: true, data }, 200, origin);
            }

            if (path === '/api/get-countries') {
                const codes = getCountries();
                if (codes.length === 0) return json({ success: false, error: 'No countries configured' }, 200, origin);
                return json({ success: true, data: codes }, 200, origin);
            }

            if (path === '/api/track') {
                const { q, quality } = schemas.track.parse(params);
                const results = await search(q, 1, 0, country, env);
                const track = results?.tracks?.items?.[0];
                if (!track) return json({ success: false, error: 'Track not found' }, 404, origin);
                const url = await getDownloadURL(track.id, quality, country, env);
                return json({ success: true, data: { url } }, 200, origin);
            }

            if (path === '/api/download-music') {
                const { track_id, quality } = schemas.downloadMusic.parse(params);
                const dlUrl = await getDownloadURL(track_id, quality, country, env);
                return json({ success: true, data: { url: dlUrl } }, 200, origin);
            }
        } catch (error: any) {
            return err(error, 400, origin);
        }

        return json({ error: 'Not found' }, 404, origin);
    }
} satisfies ExportedHandler<Env>;
