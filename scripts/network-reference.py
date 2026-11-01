"""Run the original NumPy network against supplied model weights, without Pygame."""
import json
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from network import Network

weights = json.load(sys.stdin)
model = Network([9, 16, 3])
model.setWeights([
    np.asarray(weights[:144]).reshape(16, 9),
    np.asarray(weights[160:208]).reshape(3, 16),
])
model.setBiases([
    np.asarray(weights[144:160]).reshape(16, 1),
    np.asarray(weights[208:211]).reshape(3, 1),
])
inputs = [[0] * 9, [1] * 9]
inputs += [[int(i == j) for i in range(9)] for j in range(9)]
inputs += [[(i * 3 + seed) % 2 for i in range(9)] for seed in range(2)]
result = [
    {"input": item, "output": model.feedforward(np.asarray(item).reshape(9, 1)).reshape(3).tolist()}
    for item in inputs
]
print(json.dumps(result, indent=2))
