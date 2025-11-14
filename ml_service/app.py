from fastapi import FastAPI
from pydantic import BaseModel
import joblib, os, numpy as np

MODEL_PATH = os.environ.get("MODEL_PATH", "models/eco_model.pkl")
app = FastAPI(title="EcoRoute ML Service")

VEHICLE_FACTORS = {
    "car": {"weight": 1200, "co2_factor": 1.0},    
    "van": {"weight": 2500, "co2_factor": 1.4},
    "bike": {"weight": 200, "co2_factor": 0.2},     
    "ev": {"weight": 1800, "co2_factor": 0.0},     
}

class Features(BaseModel):
    distance_km: float
    elevation_gain_m: float = 0.0
    avg_speed_kph: float = 50.0
    turns: int = 0
    humps: int = 0
    weight_kg: float = 1000.0
    traffic_index: float = 1.0
    route_type: str = "fast"
    vehicle: str = "car"  

@app.on_event("startup")
def load_model():
    global model
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Model missing at {MODEL_PATH}. Run train_model.py to create it.")
    model = joblib.load(MODEL_PATH)

@app.post("/predict")
def predict(feat: Features):
    
    route_type_val = 0 if feat.route_type == "fast" else 1

    
    v = VEHICLE_FACTORS.get(feat.vehicle, VEHICLE_FACTORS["car"])
    base_weight = v["weight"]
    co2_factor = v["co2_factor"]

    X = np.array([[ 
        feat.distance_km,
        feat.elevation_gain_m,
        feat.avg_speed_kph,
        feat.turns,
        feat.humps,
        base_weight,               
        feat.traffic_index,
        route_type_val
    ]])

 
    pred = model.predict(X)[0]
    fuel, co2 = float(pred[0]), float(pred[1])

    co2 *= co2_factor

    if feat.vehicle == "ev":
        energy_kwh = feat.distance_km * 0.2
        return {"fuel_l": 0.0, "energy_kwh": energy_kwh, "co2_kg": co2}

    return {"fuel_l": fuel, "co2_kg": co2}
