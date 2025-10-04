/**
 * server.js - Node backend integrating OSRM + ML service
 */

import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving/';
const ML_URL = process.env.ML_URL || 'http://localhost:8000/predict';

function coordsToOsrm(a, b) {
  return `${a.lng},${a.lat};${b.lng},${b.lat}`;
}

app.post('/api/route', async (req, res) => {
  try {
    const { source, destination, vehicle='car', weight_kg=1000, optimizeFor='co2' } = req.body;
    if (!source || !destination) return res.status(400).json({ error: 'source and destination required' });

    // Request OSRM for alternatives
    const coords = coordsToOsrm(source, destination);
    const url = `${OSRM_BASE}${coords}?alternatives=true&geometries=geojson&overview=full&annotations=distance,duration`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.routes || j.routes.length === 0) return res.status(500).json({ error: 'No routes from OSRM' });

    const fastRoute = j.routes[0];
    let ecoRoute = j.routes[1];

    // If OSRM didn’t return an alternative, try forcing a waypoint offset
    if (!ecoRoute) {
      const midLat = (source.lat + destination.lat) / 2 + 0.01;
      const midLng = (source.lng + destination.lng) / 2;
      const coordsAlt = `${source.lng},${source.lat};${midLng},${midLat};${destination.lng},${destination.lat}`;
      const urlAlt = `${OSRM_BASE}${coordsAlt}?geometries=geojson&overview=full`;
      const rAlt = await fetch(urlAlt);
      const jAlt = await rAlt.json();
      if (jAlt.routes && jAlt.routes[0]) ecoRoute = jAlt.routes[0];
    }
    const altRoute = ecoRoute || fastRoute;

    // ---- ML call wrapper with route_type ----
    async function callML(route, routeType) {
      const distance_km = (route.distance || 0) / 1000.0;
      const elevation_gain_m = 0; // placeholder
      const avg_speed_kph = distance_km / ((route.duration || 1) / 3600 || 1);
      const turns = Math.max(1, Math.floor(route.geometry.coordinates.length / 10));
      const humps = Math.max(0, Math.floor(turns / 4));

      const features = {
        distance_km,
        elevation_gain_m,
        avg_speed_kph,
        turns,
        humps,
        weight_kg,
        traffic_index: 1.0,
        route_type: routeType   // NEW
      };

      const mlRes = await fetch(ML_URL, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(features)
      });
      if (!mlRes.ok) {
        const txt = await mlRes.text();
        throw new Error('ML service error: ' + txt);
      }
      return await mlRes.json(); // {fuel_l, co2_kg}
    }

    // Call ML service with route_type info
    const [fastMl, altMl] = await Promise.all([
      callML(fastRoute, "fast"),
      callML(altRoute, "eco")
    ]);

    const time_optimized = {
      distance_km: +(fastRoute.distance / 1000).toFixed(3),
      duration_min: +(fastRoute.duration / 60).toFixed(1),
      fuel_l: +(fastMl.fuel_l).toFixed(3),
      co2_kg: +(fastMl.co2_kg).toFixed(3),
      geometry: fastRoute.geometry
    };
    const eco_optimized = {
      distance_km: +(altRoute.distance / 1000).toFixed(3),
      duration_min: +(altRoute.duration / 60).toFixed(1),
      fuel_l: +(altMl.fuel_l).toFixed(3),
      co2_kg: +(altMl.co2_kg).toFixed(3),
      geometry: altRoute.geometry
    };

    const preferred = optimizeFor === 'time' ? time_optimized : eco_optimized;
    const co2SavedPercent = Math.max(0, ((time_optimized.co2_kg - eco_optimized.co2_kg) / (time_optimized.co2_kg || 1)) * 100);

    res.json({ time_optimized, eco_optimized, preferred, co2SavedPercent: Math.round(co2SavedPercent) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('EcoRoute backend running on port', port));
