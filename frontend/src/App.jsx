import React, { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts'

// fix default icon paths for leaflet when bundled
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function FitBounds({positions}) {
  const map = useMap()
  useEffect(()=>{
    if (!positions || positions.length===0) return
    const all = positions.flat()
    map.fitBounds(all, {padding:[40,40]})
  }, [positions, map])
  return null
}

export default function App(){
  const [from, setFrom] = useState('Times Square, New York')
  const [to, setTo] = useState('Central Park, New York')
  const [vehicle, setVehicle] = useState('car')
  const [analysis, setAnalysis] = useState(null)
  const [srcDstCoords, setSrcDstCoords] = useState(null) // {source:{lat,lng}, destination:{lat,lng}}

  async function geocode(q){
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q))
    const j = await res.json()
    if (!j || j.length===0) throw new Error('Geocode failed for '+q)
    return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), name: j[0].display_name }
  }

  async function compute(){
    try{
      setAnalysis(null)
      const s = await geocode(from)
      const d = await geocode(to)
      setSrcDstCoords({source:s,destination:d})

      const body = { source: s, destination: d, vehicle, weight_kg:1000, optimizeFor:'co2' }
      const r = await fetch('/api/route', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setAnalysis({ ...j, source: s, destination: d })
    }catch(e){
      alert(e.message)
      console.error(e)
    }
  }

  // prepare polylines from geojson geometry
  function geoToLatLngs(geometry){
    if (!geometry || !geometry.coordinates) return []
    return geometry.coordinates.map(pt => [pt[1], pt[0]])
  }

  return (
    <div className="app">
      <div className="panel controls">
        <h2>EcoRoute</h2>
        <label>Source</label>
        <input value={from} onChange={e=>setFrom(e.target.value)} />
        <label>Destination</label>
        <input value={to} onChange={e=>setTo(e.target.value)} />
        <label>Vehicle</label>
        <select value={vehicle} onChange={e=>setVehicle(e.target.value)}>
          <option value="car">Car</option>
          <option value="van">Van</option>
          <option value="bike">Bike</option>
          <option value="ev">EV</option>
        </select>
        <button className="button" onClick={compute}>Calculate routes</button>

        {analysis && (
          <div style={{marginTop:12}}>
            <h3>Comparison</h3>
            <div><strong>Shortest</strong>: {analysis.time_optimized.distance_km} km — {analysis.time_optimized.duration_min} min — {analysis.time_optimized.fuel_l} L — {analysis.time_optimized.co2_kg} kg CO₂</div>
            <div><strong>Eco</strong>: {analysis.eco_optimized.distance_km} km — {analysis.eco_optimized.duration_min} min — {analysis.eco_optimized.fuel_l} L — {analysis.eco_optimized.co2_kg} kg CO₂</div>
            <div style={{marginTop:8}}>CO₂ saved: {analysis.co2SavedPercent}%</div>

            <h4 style={{marginTop:12}}>CO₂ Comparison</h4>
            <BarChart width={260} height={180} data={[
              { name:'Fast', CO2: analysis.time_optimized.co2_kg },
              { name:'Eco', CO2: analysis.eco_optimized.co2_kg }
            ]}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="CO2" fill="#2ecc71" />
            </BarChart>
          </div>
        )}
      </div>

      <div className="map-wrap">
        <MapContainer id="map" center={[40.758, -73.9855]} zoom={13} style={{height:'100%', width:'100%'}}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
          { srcDstCoords && <Marker position={[srcDstCoords.source.lat, srcDstCoords.source.lng]} /> }
          { srcDstCoords && <Marker position={[srcDstCoords.destination.lat, srcDstCoords.destination.lng]} /> }

          { analysis && (
            <>
              <Polyline positions={geoToLatLngs(analysis.time_optimized.geometry)} color="blue" weight={5} />
              <Polyline positions={geoToLatLngs(analysis.eco_optimized.geometry)} color="green" weight={5} />
              <FitBounds positions={[geoToLatLngs(analysis.time_optimized.geometry), geoToLatLngs(analysis.eco_optimized.geometry)]} />
            </>
          )}
        </MapContainer>
      </div>
    </div>
  )
}
