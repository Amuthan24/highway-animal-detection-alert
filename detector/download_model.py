"""Downloads the YOLOX-S model (Apache-2.0) if models/yolox_s.onnx is missing. Usage: python download_model.py"""
import hashlib
import os
import sys
import urllib.request

URL = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx"
SHA256 = "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063"
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "models", "yolox_s.onnx")

os.makedirs(os.path.dirname(dest), exist_ok=True)
if os.path.exists(dest):
    print("Model already there:", dest)
    sys.exit(0)
print("Downloading", URL)
urllib.request.urlretrieve(URL, dest)
digest = hashlib.sha256(open(dest, "rb").read()).hexdigest()
if digest != SHA256:
    os.remove(dest)
    sys.exit("Checksum mismatch, file deleted. Download again.")
print("Saved and verified:", dest)
