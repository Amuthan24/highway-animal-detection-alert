"""
Animal detector service (the ML part of the project).

Model : YOLOX-S, pretrained on COCO (Apache-2.0 licence), run with ONNX Runtime.
Input : raw image bytes in the body of POST /detect
Output: JSON list of detections (only COCO animal classes are marked animal=true)

Run:  python app.py        (listens on http://127.0.0.1:5000)
"""
import io
import os
import time

import numpy as np
import onnxruntime as ort
from flask import Flask, jsonify, request
from PIL import Image, ImageOps

MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(os.path.dirname(__file__), "models", "yolox_s.onnx"))
SCORE_THRESHOLD = float(os.environ.get("SCORE_THRESHOLD", "0.30"))
NMS_THRESHOLD = float(os.environ.get("NMS_THRESHOLD", "0.45"))

# The 80 COCO class names, in the order the model was trained with.
COCO = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
        "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog",
        "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
        "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
        "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
        "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
        "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant",
        "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
        "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors",
        "teddy bear", "hair drier", "toothbrush"]

# Animals that can matter on an Indian road (birds are left out on purpose).
ROAD_ANIMALS = {"cat", "dog", "horse", "sheep", "cow", "elephant", "bear"}

# ORT_THREADS: optional. Number of CPU threads the model may use. 0 or missing = onnxruntime decides (the old behaviour).
ORT_THREADS = int(os.environ.get("ORT_THREADS", "0"))
options = ort.SessionOptions()
if ORT_THREADS > 0:
    options.intra_op_num_threads = ORT_THREADS
session = ort.InferenceSession(MODEL_PATH, sess_options=options, providers=["CPUExecutionProvider"])
INPUT_NAME = session.get_inputs()[0].name
INPUT_SIZE = session.get_inputs()[0].shape[2]  # 640 for YOLOX-S, 416 for YOLOX-Nano

app = Flask(__name__)


def preprocess(img):
    """Letterbox to INPUT_SIZE x INPUT_SIZE (grey padding), BGR, float32, CHW."""
    w, h = img.size
    ratio = min(INPUT_SIZE / h, INPUT_SIZE / w)
    new_w, new_h = int(w * ratio), int(h * ratio)
    resized = img.resize((new_w, new_h), Image.BILINEAR)
    canvas = np.full((INPUT_SIZE, INPUT_SIZE, 3), 114, dtype=np.uint8)
    canvas[:new_h, :new_w] = np.asarray(resized)
    canvas = canvas[:, :, ::-1]  # RGB -> BGR (YOLOX expects BGR)
    blob = np.ascontiguousarray(canvas.transpose(2, 0, 1), dtype=np.float32)[None]
    return blob, ratio


def decode(raw):
    """YOLOX raw output (1, N, 85) -> boxes in network-input pixels + scores."""
    out = raw[0].copy()
    grids, strides = [], []
    for stride in (8, 16, 32):
        n = INPUT_SIZE // stride
        xv, yv = np.meshgrid(np.arange(n), np.arange(n))
        grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
        strides.append(np.full((n * n, 1), stride))
    grids = np.concatenate(grids).astype(np.float32)
    strides = np.concatenate(strides).astype(np.float32)
    out[:, :2] = (out[:, :2] + grids) * strides
    out[:, 2:4] = np.exp(out[:, 2:4]) * strides
    cx, cy, bw, bh = out[:, 0], out[:, 1], out[:, 2], out[:, 3]
    boxes = np.stack((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), axis=1)
    class_scores = out[:, 5:] * out[:, 4:5]  # objectness x class probability
    return boxes, class_scores


def nms(boxes, scores, thr):
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(boxes[i, 0], boxes[order[1:], 0])
        yy1 = np.maximum(boxes[i, 1], boxes[order[1:], 1])
        xx2 = np.minimum(boxes[i, 2], boxes[order[1:], 2])
        yy2 = np.minimum(boxes[i, 3], boxes[order[1:], 3])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        area_i = (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1])
        area_o = (boxes[order[1:], 2] - boxes[order[1:], 0]) * (boxes[order[1:], 3] - boxes[order[1:], 1])
        iou = inter / (area_i + area_o - inter + 1e-9)
        order = order[1:][iou <= thr]
    return keep


def detect(img):
    width, height = img.size
    blob, ratio = preprocess(img)
    raw = session.run(None, {INPUT_NAME: blob})[0]
    boxes, class_scores = decode(raw)
    class_ids = class_scores.argmax(1)
    scores = class_scores.max(1)
    mask = scores > SCORE_THRESHOLD
    boxes, scores, class_ids = boxes[mask] / ratio, scores[mask], class_ids[mask]
    results = []
    for i in nms(boxes, scores, NMS_THRESHOLD):
        x1, y1, x2, y2 = boxes[i]
        label = COCO[int(class_ids[i])]
        results.append({
            "label": label,
            "classId": int(class_ids[i]),
            "animal": label in ROAD_ANIMALS,
            "confidence": round(float(scores[i]), 4),
            "x1": int(max(0, x1)), "y1": int(max(0, y1)),
            "x2": int(min(width, x2)), "y2": int(min(height, y2)),
        })
    return results


@app.get("/health")
def health():
    return jsonify(status="ok", model=os.path.basename(MODEL_PATH), inputSize=INPUT_SIZE, threads=ORT_THREADS or "auto")


@app.post("/detect")
def detect_endpoint():
    data = request.get_data()
    if not data:
        return jsonify(error="empty body: send the image bytes"), 400
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")  # phone photos can be rotated by EXIF
    except Exception:
        return jsonify(error="not a valid image (use JPG or PNG)"), 400
    start = time.time()
    detections = detect(img)
    return jsonify(width=img.size[0], height=img.size[1],
                   inferenceMs=int((time.time() - start) * 1000), detections=detections)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")))
