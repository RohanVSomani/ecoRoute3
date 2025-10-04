# app.py - FastAPI ML inference service
from fastapi import FastAPI
from pydantic import BaseModel
import joblib, os, numpy as np

MODEL_PATH = os.environ.get('MODEL_PATH', 'models/eco_model.pkl')
app = FastAPI(title="EcoRoute ML Service")

class Features(BaseModel):
    distance_km: float
    elevation_gain_m: float = 0.0
    avg_speed_kph: float = 50.0
    turns: int = 0
    humps: int = 0
    weight_kg: float = 1000.0
    traffic_index: float = 1.0
    route_type: str = "fast"  # <-- NEW

@app.on_event("startup")
def load_model():
    global model
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Model missing at {MODEL_PATH}. Run train_model.py to create it.")
    model = joblib.load(MODEL_PATH)

@app.post("/predict")
def predict(feat: Features):
    X = np.array([[
        feat.distance_km,
        feat.elevation_gain_m,
        feat.avg_speed_kph,
        feat.turns,
        feat.humps,
        feat.weight_kg,
        feat.traffic_index
    ]])
    
    # Base ML prediction
    pred = model.predict(X)[0]  # [fuel_l, co2_kg]
    fuel, co2 = float(pred[0]), float(pred[1])

    # -------------------------
    # Dynamic adjustments
    # -------------------------
    # Example heuristic: eco routes usually mean smoother speeds, fewer accelerations
    if feat.route_type == "eco":
        if feat.avg_speed_kph < 60:
            co2 *= 0.9   # smoother, slower eco driving
            fuel *= 0.9
        elif feat.turns < 20 and feat.traffic_index < 1.2:
            co2 *= 0.92
            fuel *= 0.92
        else:
            co2 *= 0.95
            fuel *= 0.95

    elif feat.route_type == "fast":
        if feat.avg_speed_kph > 80:
            co2 *= 1.05   # highway fast route → higher emissions
            fuel *= 1.05

    return {"fuel_l": fuel, "co2_kg": co2}
