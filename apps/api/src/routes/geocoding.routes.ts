import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { env } from '../env';

export const geocodingRoutes = new Hono();

const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_PLACES_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';

// GET /geocoding/reverse?lat=&lng=
geocodingRoutes.get(
  '/reverse',
  zValidator(
    'query',
    z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    })
  ),
  async (c) => {
    const { lat, lng } = c.req.valid('query');

    if (!env.GOOGLE_MAPS_API_KEY) {
      // Fallback: return coordinate string when no API key configured
      return c.json({
        data: {
          address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          lat,
          lng,
        },
      });
    }

    const url = new URL(GOOGLE_GEOCODE_URL);
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);
    url.searchParams.set('result_type', 'street_address|sublocality|locality');

    const res = await fetch(url.toString());
    const json = (await res.json()) as { status: string; results: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[] };

    if (json.status !== 'OK' || json.results.length === 0) {
      return c.json({
        data: {
          address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          lat,
          lng,
        },
      });
    }

    const top = json.results[0];
    return c.json({
      data: {
        address: top.formatted_address,
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
      },
    });
  }
);

// GET /geocoding/autocomplete?query=&lat=&lng=
geocodingRoutes.get(
  '/autocomplete',
  zValidator(
    'query',
    z.object({
      query: z.string().min(1),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
    })
  ),
  async (c) => {
    const { query, lat, lng } = c.req.valid('query');

    if (!env.GOOGLE_MAPS_API_KEY) {
      return c.json({ data: [] });
    }

    const url = new URL(GOOGLE_PLACES_URL);
    url.searchParams.set('input', query);
    url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);
    url.searchParams.set('components', 'country:ng');
    url.searchParams.set('language', 'en');
    if (lat != null && lng != null) {
      url.searchParams.set('location', `${lat},${lng}`);
      url.searchParams.set('radius', '50000');
    }

    const res = await fetch(url.toString());
    const json = (await res.json()) as {
      status: string;
      predictions: { place_id: string; description: string; structured_formatting: { main_text: string; secondary_text: string } }[];
    };

    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      return c.json({ data: [] });
    }

    const suggestions = (json.predictions ?? []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description,
      secondaryText: p.structured_formatting?.secondary_text ?? '',
    }));

    return c.json({ data: suggestions });
  }
);

// GET /geocoding/place?placeId= — resolve a place_id to lat/lng
geocodingRoutes.get(
  '/place',
  zValidator('query', z.object({ placeId: z.string().min(1) })),
  async (c) => {
    const { placeId } = c.req.valid('query');

    if (!env.GOOGLE_MAPS_API_KEY) {
      return c.json({ error: { code: 'NOT_CONFIGURED', message: 'Geocoding not configured' } }, 503);
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'geometry,formatted_address,name');
    url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);

    const res = await fetch(url.toString());
    const json = (await res.json()) as {
      status: string;
      result?: { name: string; formatted_address: string; geometry: { location: { lat: number; lng: number } } };
    };

    if (json.status !== 'OK' || !json.result) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Place not found' } }, 404);
    }

    return c.json({
      data: {
        name: json.result.name,
        address: json.result.formatted_address,
        lat: json.result.geometry.location.lat,
        lng: json.result.geometry.location.lng,
      },
    });
  }
);
