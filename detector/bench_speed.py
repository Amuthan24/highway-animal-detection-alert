"""
Times the detector's model on THIS computer, using the same code as the real detector.

Run it in the detector folder with the venv switched on:
    python bench_speed.py                              (uses models\\yolox_s.onnx)
    python bench_speed.py models\\yolox_tiny.onnx       (a lighter model)
    python bench_speed.py models\\yolox_s.onnx photo.jpg  (use your own photo)

Stop the real detector first (this script loads its own copy of the model).
"""
import os
import statistics
import sys
import time

import numpy as np
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) > 1:
    os.environ["MODEL_PATH"] = os.path.abspath(sys.argv[1])
sys.path.insert(0, here)

import onnxruntime as ort
import app  # loads the model exactly like the real detector does

if len(sys.argv) > 2:
    img = Image.open(sys.argv[2]).convert("RGB")
    img = img.resize((640, max(1, round(img.height * 640 / img.width))))
else:
    rng = np.random.default_rng(1)  # plain noise picture: the model's cost barely depends on what is in the picture
    img = Image.fromarray(rng.integers(0, 255, (360, 640, 3), dtype=np.uint8))

print("Model       :", os.path.basename(app.MODEL_PATH))
print("Input size  :", app.INPUT_SIZE)
print("CPU cores   :", os.cpu_count())
print("Providers   :", ort.get_available_providers())

app.detect(img)  # warm-up run, not counted
times = []
for _ in range(10):
    start = time.time()
    app.detect(img)
    times.append((time.time() - start) * 1000)

print("10 runs (ms): min %.0f | median %.0f | max %.0f" % (min(times), statistics.median(times), max(times)))
