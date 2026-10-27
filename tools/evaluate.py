"""
Measure the detector on YOUR OWN photos.

1. Put your road photos (JPG/PNG) in one folder, e.g. my_photos/
2. Create my_photos/labels.csv with a header and one line per photo:
       filename,animal,level
       road1.jpg,yes,DANGER
       road2.jpg,no,SAFE
   animal = yes/no (is there a road animal in the photo?)
   level  = what the alert SHOULD be: SAFE, CAUTION or DANGER (optional, leave empty to skip)
3. Run:   python tools/evaluate.py my_photos
   (run it from the project folder, with the detector's packages installed)

It prints precision, recall and a list of the photos it got wrong, and writes results.csv.
Aim for at least 60 photos, including photos WITHOUT animals, otherwise the numbers mean little.
"""
import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "detector"))
from PIL import Image, ImageOps  # noqa: E402
import app as detector  # noqa: E402

# Same numbers as backend/src/main/resources/application.properties
MIN_CONF, PATH_L, PATH_R, DANGER_H = 0.40, 0.25, 0.75, 0.25


def predict(path):
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    w, h = img.size
    level, labels = "SAFE", []
    for d in detector.detect(img):
        if not d["animal"] or d["confidence"] < MIN_CONF:
            continue
        labels.append(d["label"])
        cx = (d["x1"] + d["x2"]) / 2 / w
        close = (d["y2"] - d["y1"]) / h >= DANGER_H
        this = "DANGER" if PATH_L <= cx <= PATH_R and close else "CAUTION"
        if this == "DANGER" or level == "SAFE":
            level = this
    return level, labels


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python tools/evaluate.py <folder with photos and labels.csv>")
    folder = sys.argv[1]
    rows = list(csv.DictReader(open(os.path.join(folder, "labels.csv"), newline="", encoding="utf-8")))
    tp = fp = fn = tn = 0
    level_ok = level_total = 0
    wrong, out = [], []
    for r in rows:
        name = r["filename"].strip()
        truth = r["animal"].strip().lower() == "yes"
        level, labels = predict(os.path.join(folder, name))
        guess = level != "SAFE"
        tp += truth and guess
        fp += (not truth) and guess
        fn += truth and (not guess)
        tn += (not truth) and (not guess)
        want = (r.get("level") or "").strip().upper()
        if want:
            level_total += 1
            level_ok += want == level
        if truth != guess or (want and want != level):
            wrong.append((name, "animal" if truth else "no animal", want or "-", level, ",".join(labels) or "none"))
        out.append([name, r["animal"], want, level, ",".join(labels)])

    print(f"Photos: {len(rows)}   with animal: {tp + fn}   without animal: {tn + fp}")
    print(f"True positives {tp}, false alarms {fp}, missed animals {fn}, true negatives {tn}")
    print(f"Precision: {tp / (tp + fp):.2f}" if tp + fp else "Precision: n/a")
    print(f"Recall   : {tp / (tp + fn):.2f}   <- a missed animal is the costly mistake" if tp + fn else "Recall: n/a")
    if level_total:
        print(f"Alert level correct: {level_ok}/{level_total}")
    if wrong:
        print("\nPhotos to look at (truth / expected level / predicted level / animals found):")
        for w in wrong:
            print("  ", *w, sep=" | ")
    with open("results.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["filename", "animal_truth", "expected_level", "predicted_level", "animals_found"])
        wr.writerows(out)
    print("\nWrote results.csv")


if __name__ == "__main__":
    main()
