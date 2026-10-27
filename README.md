# Highway Animal Alert

A small web app that checks a road photo for animals (dog, cow, horse, sheep, cat, elephant, bear) and shows a
driver alert: **SAFE**, **CAUTION** or **DANGER**. Every check is saved in MySQL and shown in a history table.

Problem: animals suddenly crossing a highway cause accidents. This prototype shows the idea on still photos.
It is a student prototype, **not a real driver-safety device**. Read `docs/LIMITATIONS.md` before presenting.

## How it works

```
Browser (HTML/CSS/JS)  --photo-->  Spring Boot (Java, port 8080)  --image bytes-->  Python detector (port 5000)
        ^                                  |  applies the alert rule                  YOLOX-S model, ONNX Runtime
        |                                  v
        +-----------  JSON result  <-- MySQL (saves every check)
```

| Part | Folder | Does |
|---|---|---|
| Web page | `backend/src/main/resources/static` | upload form, photo with boxes, alert banner, history, stats |
| Backend | `backend/` | REST API, alert rule (`AlertRule.java`), saves to MySQL |
| ML detector | `detector/` | loads the model, finds objects, returns boxes as JSON |
| Database | `database/schema.sql` | two tables: `detection_event`, `detected_animal` |
| Measuring | `tools/evaluate.py` | precision/recall on **your own** labelled photos |

## What you need installed

- JDK 17 or newer, and Maven (or the VS Code "Extension Pack for Java" + "Spring Boot Extension Pack")
- MySQL 8 (the schema was also tested on MariaDB 10.11)
- Python 3.10 or newer

## Run it (4 steps)

**1. Create the database** (once). In a terminal in this folder:

```
mysql -u root -p < database/schema.sql
```

**2. Start the detector** (keep this terminal open):

```
cd detector
python -m venv venv
venv\Scripts\activate          (Linux/Mac:  source venv/bin/activate)
pip install -r requirements.txt
python download_model.py       (only if detector/models/yolox_s.onnx is missing)
python app.py
```

**3. Start the backend** (second terminal). Use your MySQL password:

```
cd backend
set DB_PASSWORD=your_password            (PowerShell: $env:DB_PASSWORD="your_password")
mvn spring-boot:run                      (Linux/Mac: export DB_PASSWORD=... first)
```

If your MySQL user is not `root`, also set `DB_USER`. Or edit `backend/src/main/resources/application.properties`.

**4. Open** http://localhost:8080 . The three dots at the top (Backend, Detector, Database) must be green.
Choose a road photo, type a place name (optional), press **Check for animals**.

Run the rule tests with `mvn test` in the `backend` folder.

## REST API

| Method | URL | Purpose |
|---|---|---|
| POST | `/api/detect` | form fields `image` (file) and `location` (text). Returns alert level, message, boxes. Saves to MySQL. |
| GET | `/api/events?limit=20` | latest checks, newest first |
| GET | `/api/stats` | counts per animal and per alert level |
| DELETE | `/api/events` | clear the history |
| GET | `/api/health` | backend / detector / database up or down |

Detector (internal): `POST http://127.0.0.1:5000/detect` with the raw image bytes, and `GET /health`.

## The alert rule

Written in `AlertRule.java` (plain Java, easy to read). For each animal the model finds with confidence of at least 0.40:

- **DANGER**: the box centre is in the middle half of the photo width (my lane) **and** the box is at least 25% of the photo height (looks close)
- **CAUTION**: any other animal
- **SAFE**: no animal

The numbers are in `application.properties`. They are **demo values, not calibrated to real braking distances**.

## The ML part

- Model: **YOLOX-S**, pretrained on the COCO dataset, Apache-2.0 licence
  ([YOLOX repo](https://github.com/Megvii-BaseDetection/YOLOX), file `yolox_s.onnx` from release 0.1.1rc0).
  It is run with ONNX Runtime on CPU. **It is not trained or fine-tuned by this project.**
- COCO has no "goat" class, so goats may show up as sheep, dog or cow, or be missed.
- Your own contribution to the ML side: choosing the animals that matter, the confidence threshold, the alert rule,
  and **measuring it on real road photos** with `tools/evaluate.py` (see `docs/ACCEPTANCE.md`).

Measure it:

```
python tools/evaluate.py my_photos        (folder with your photos + labels.csv, instructions are inside the script)
```

## Third-party licences

- YOLOX code and weights: Apache-2.0
- Flask (BSD), ONNX Runtime (MIT), NumPy (BSD), Pillow (HPND), Spring Boot (Apache-2.0), MySQL Connector/J (GPLv2 with FOSS exception)
- No dataset is bundled. Use your own phone photos, or images whose licence you checked and recorded.

## If something fails

| Problem | Fix |
|---|---|
| Detector dot is red | start `python app.py` in the `detector` folder |
| Database dot is red / "Access denied" | wrong `DB_USER` / `DB_PASSWORD`, or schema.sql not run |
| "Unknown database animal_alert" | run step 1 |
| Port 8080 or 5000 already used | close the other program, or change `server.port` / the `PORT` environment variable (and `detector.url`) |
| `mvn` not found | install Maven, or use the Spring Boot extension in VS Code to run `AnimalAlertApplication` |
| Build error in the Java code | copy the full error text and ask for help (see "Not tested" in `docs/ACCEPTANCE.md`) |
