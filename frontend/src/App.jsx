import React, { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// fix default icon paths for leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (!positions || positions.length === 0) return;
    const all = positions.flat();
    map.fitBounds(all, { padding: [40, 40] });
  }, [positions, map]);
  return null;
}

export default function App() {
  const [from, setFrom] = useState("Times Square, New York");
  const [to, setTo] = useState("Central Park, New York");
  const [vehicle, setVehicle] = useState("car");
  const [analysis, setAnalysis] = useState(null);
  const [srcDstCoords, setSrcDstCoords] = useState(null);

  async function geocode(q) {
    const res = await fetch(
      "https://nominatim.openstreetmap.org/search?format=json&q=" +
        encodeURIComponent(q)
    );
    const j = await res.json();
    if (!j || j.length === 0) throw new Error("Geocode failed for " + q);
    return {
      lat: parseFloat(j[0].lat),
      lng: parseFloat(j[0].lon),
      name: j[0].display_name,
    };
  }

  async function compute() {
    try {
      setAnalysis(null);
      const s = await geocode(from);
      const d = await geocode(to);
      setSrcDstCoords({ source: s, destination: d });

      const body = {
        source: s,
        destination: d,
        vehicle,
        weight_kg: 1000,
        optimizeFor: "co2",
      };
      const r = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setAnalysis({ ...j, source: s, destination: d });
    } catch (e) {
      alert(e.message);
      console.error(e);
    }
  }

  function geoToLatLngs(geometry) {
    if (!geometry || !geometry.coordinates) return [];
    return geometry.coordinates.map((pt) => [pt[1], pt[0]]);
  }

  return (
    <div className="app">
      {/* Side panel */}
      <div className="panel">
        <h2>EcoRoute</h2>

        <label>Source</label>
        <input value={from} onChange={(e) => setFrom(e.target.value)} />

        <label>Destination</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} />

        <label>Vehicle</label>
        <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
          <option value="car">Car</option>
          <option value="van">Van</option>
          <option value="bike">Bike</option>
          <option value="ev">EV</option>
        </select>

        <button onClick={compute}>Calculate routes</button>

        {analysis && (
          <div className="results">
            {/* Stats Cards */}
            <div className="cards">
              <div className="card">
                <h3>Shortest Route</h3>
                <p>
                  {analysis.time_optimized.distance_km} km •{" "}
                  {analysis.time_optimized.duration_min} min
                </p>
                <p>
                  {analysis.time_optimized.fuel_l} L •{" "}
                  {analysis.time_optimized.co2_kg} kg CO₂
                </p>
              </div>
              <div className="card">
                <h3>Eco Route</h3>
                <p>
                  {analysis.eco_optimized.distance_km} km •{" "}
                  {analysis.eco_optimized.duration_min} min
                </p>
                <p>
                  {analysis.eco_optimized.fuel_l} L •{" "}
                  {analysis.eco_optimized.co2_kg} kg CO₂
                </p>
              </div>
            </div>

            {/* CO2 Saved */}
            <div className="highlight">
              <h4>CO₂ Saved</h4>
              <span className="percent">{analysis.co2SavedPercent}%</span>
            </div>

            {/* Graph */}
            <div className="chart">
              <h4>Route Comparison</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={[
                    {
                      name: "Distance (km)",
                      Fast: analysis.time_optimized.distance_km,
                      Eco: analysis.eco_optimized.distance_km,
                    },
                    {
                      name: "Duration (min)",
                      Fast: analysis.time_optimized.duration_min,
                      Eco: analysis.eco_optimized.duration_min,
                    },
                    {
                      name: "Fuel (L)",
                      Fast: analysis.time_optimized.fuel_l,
                      Eco: analysis.eco_optimized.fuel_l,
                    },
                    {
                      name: "CO₂ (kg)",
                      Fast: analysis.time_optimized.co2_kg,
                      Eco: analysis.eco_optimized.co2_kg,
                    },
                  ]}
                >
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Fast" fill="#4A90E2" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Eco" fill="#27AE60" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="map">
        <MapContainer
          id="map"
          center={[40.758, -73.9855]}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          {srcDstCoords && (
            <>
              <Marker
                position={[srcDstCoords.source.lat, srcDstCoords.source.lng]}
              />
              <Marker
                position={[
                  srcDstCoords.destination.lat,
                  srcDstCoords.destination.lng,
                ]}
              />
            </>
          )}
          {analysis && (
            <>
              <Polyline
                positions={geoToLatLngs(analysis.time_optimized.geometry)}
                color="blue"
                weight={5}
              />
              <Polyline
                positions={geoToLatLngs(analysis.eco_optimized.geometry)}
                color="green"
                weight={5}
              />
              <FitBounds
                positions={[
                  geoToLatLngs(analysis.time_optimized.geometry),
                  geoToLatLngs(analysis.eco_optimized.geometry),
                ]}
              />
            </>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
