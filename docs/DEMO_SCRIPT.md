# 3-minute demo script

**Before you start (5 minutes, do it twice before the real demo)**
- Start MySQL, the detector and the backend. Open http://localhost:8080 and check all three dots are green.
- Click **Clear history** so the table is empty.
- Have 3 photos ready in one folder (take them yourself with your phone, or use images whose licence you checked):
  1. a road with **no animal** (should be SAFE)
  2. an animal **at the side** of the road or far away (should be CAUTION)
  3. an animal **in the middle** of the road and close (should be DANGER)
- Test all 3 first. If one gives a different level than you expected, replace it with another photo and say honestly
  that results depend on the photo. Do not pick only the photos that look best and then claim general accuracy.

**0:00 - 0:30  The problem**
"On highways, a dog or cow can cross suddenly and the driver has only seconds. I wanted a small system that looks at the
road photo, finds animals, and warns the driver."

**0:30 - 1:00  How it is built**
Point at the page, then say: "The page is HTML, CSS and JavaScript. It sends the photo to a Spring Boot backend.
The backend sends it to a Python service that runs a pretrained YOLOX model with ONNX Runtime. The backend applies my
alert rule and saves the result in MySQL." Point at the three green dots: "These show all three parts are running."

**1:00 - 2:15  Live demo (about 25 seconds per photo)**
1. Photo 1 (no animal): green banner, "No animals detected".
2. Photo 2 (side/far): amber CAUTION, box drawn on the animal.
3. Photo 3 (in lane, close): red DANGER banner, beep, box with the animal name and confidence.
Say: "The model finds the animal. My rule decides the level: DANGER only when the animal is in the middle of the picture
and its box is large, which I use as a rough sign that it is close."

**2:15 - 2:45  The database**
Scroll to the stats and history: "Every check is saved in MySQL, with the place name, the animals and the level.
The bars are queries on the database. A road authority could use this to see where animals appear most."
(This is an idea, not something the prototype proves.)

**2:45 - 3:00  Honest close**
"This is a prototype on still photos with a pretrained model. I measured it on [N] of my own photos:
precision [x], recall [y]. It does not measure real distance or speed, so it is not a safety device. Next steps are
fine-tuning on Indian road animals such as goats and cattle, and running on video." 
(Fill in N, x, y from `python tools/evaluate.py`. If you did not run it, delete that sentence.)

**If something breaks during the demo**
- Red Detector dot: start `python app.py` again, wait 5 seconds, refresh the page.
- Red Database dot: MySQL is not running or the password is wrong.
- A photo gives a surprising result: say so, show the next photo. Never hide it.

**Questions you may get**
- *"Is this new?"* No. Animal detection for road safety has been studied before (see `docs/LIMITATIONS.md`). This is a small
  working prototype with a full web stack, not a new invention.
- *"Did you train the model?"* No, it is a pretrained open-source model. My work is the integration, the alert rule and the measurement.
- *"Why YOLOX?"* It is open source with the Apache-2.0 licence and runs on a normal laptop CPU.
