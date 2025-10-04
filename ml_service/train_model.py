# train_model.py - creates a synthetic model for CO2 prediction
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.multioutput import MultiOutputRegressor
import joblib, os

def make_synthetic(n=1500, random_state=0):
    rng = np.random.RandomState(random_state)
    distance = rng.uniform(0.5, 200, size=n)
    elevation = rng.uniform(0, 1500, size=n)
    avg_speed = rng.uniform(10,120, size=n)
    turns = rng.poisson(5, size=n)
    humps = rng.poisson(2, size=n)
    weight = rng.uniform(500,4000, size=n)
    traffic = rng.uniform(0.8,1.8, size=n)
    X = np.vstack([distance, elevation, avg_speed, turns, humps, weight, traffic]).T
    # create target roughly proportional to distance and other multipliers
    fuel = distance * (0.06 + 0.00001*weight) * (1 + elevation/10000) * (1 + turns*0.01) * traffic
    co2 = fuel * 2.31  # kg CO2 per liter (approx)
    Y = np.vstack([fuel, co2]).T + rng.normal(scale=0.02, size=(n,2))
    return X, Y

def train_and_save(path='models/eco_model.pkl'):
    os.makedirs('models', exist_ok=True)
    X, Y = make_synthetic()
    # train a multioutput regressor returning [fuel_l, co2_kg]
    model = MultiOutputRegressor(RandomForestRegressor(n_estimators=60, random_state=0, max_depth=12))
    model.fit(X, Y)
    joblib.dump(model, path)
    print('Saved model to', path)

if __name__ == '__main__':
    train_and_save()
