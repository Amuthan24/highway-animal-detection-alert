# Limitations slide (honest version)

## What this is
A working prototype: photo in, animal boxes and an alert level out, results saved in MySQL.

## What it is not
- **Not a safety device.** It works on still photos, not live video, and does not know speed or real distance.
- **Not trained by me.** The model is YOLOX-S pretrained on COCO. I did not fine-tune it on Indian road data.
- **Not new.** Camera-based animal detection for road safety exists (see below).

## Known weaknesses
- **"Close" is a guess.** The rule uses box height as a stand-in for distance. A big animal far away and a small animal close
  can look the same. The thresholds (0.40 confidence, middle 50% lane, 25% height) are demo values, not measured.
- **Goats are not a COCO class.** They may be called sheep, dog or cow, or be missed.
- **Small or far animals are unreliable.** In one quick test, the same dog photo was placed on a wider grey picture so the dog
  became smaller: the model then called it a **cat**. This is one informal test, not a measurement, but it shows how
  sensitive detection is to size. A dog seen from far away on a highway is exactly this case.
- **Night, rain, dust, motion blur and partly hidden animals** were not tested at all.
- **Speed.** About 170-250 ms per photo on the 2-core CPU of my build workspace. Your laptop may differ. At highway speed, a
  car travels several metres in that time, and a real system would also need camera capture and a faster model.
- **No own test data yet.** Precision and recall appear on the slide only if you ran `tools/evaluate.py` on at least 60 of your photos.

## Related work (found while checking prior art; read from abstracts and summaries only)
- Sharma & Shah, "A Practical Animal Detection and Collision Avoidance System Using Computer Vision Technique", IEEE Access, 2016 (cow detection on Indian highways, alert only up to about 35 km/h): https://www.academia.edu/98919641/A_Practical_Animal_Detection_and_Collision_Avoidance_System_Using_Computer_Vision_Technique
- NIT Warangal, "Computer Vision based Animal Collision Avoidance Framework for Autonomous Vehicles" (dashcam video, lane detection), arXiv 2012.10878: https://ar5iv.labs.arxiv.org/html/2012.10878
- Ferrante et al., "Evaluating YOLO ..." (full title not confirmed), Scientific Reports, 2024, DOI 10.1038/s41598-024-52054-y (YOLO versions for detecting wild animals on roads in Brazil; I only read a press summary): https://techxplore.com/news/2024-04-artificial-intelligence-wild-animals-roads.pdf
- Colorado DOT, COTAD project (YOLO for wildlife near highways, started Dec 2025): https://rip.trb.org/View/2643439
- "A Cow Crossing Detection Alert System", IJTech (roadside camera plus sound): https://ijtech.eng.ui.ac.id/article/view/5874

## Possible next steps
1. Measure on 60+ own photos and report the numbers.
2. Fine-tune on a labelled street-animal dataset (for example the CC BY 4.0 Mendeley dataset, DOI 10.17632/fk29shm2kn.1; check its image count and format first) including goats and cattle.
3. Video input, and a distance estimate that does not depend only on box size.
