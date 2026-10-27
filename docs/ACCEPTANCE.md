# Acceptance criteria

Tick each one on your own computer before you present. "Checked here" means I ran it while building in my workspace.

| # | Criterion | Checked here? |
|---|---|---|
| 1 | After starting everything, the Backend, Detector and Database dots are all green | Detector + database dots yes, using a stand-in for the Spring Boot API (see below). Real backend: **not checked** |
| 2 | A photo with no animal gives a green SAFE banner and "0 animal(s) found" | Yes (stand-in backend) |
| 3 | An animal in the middle and close gives a red DANGER banner, a box with name and %, and a beep | Yes (stand-in backend); beep **not** checked by ear |
| 4 | An animal at the side gives an amber CAUTION banner | Yes (stand-in backend) |
| 5 | A file that is not an image gives a clear error and saves nothing | Yes at the API level; the browser file picker also filters to JPG/PNG |
| 6 | With the detector stopped, the Detector dot turns red and the page shows "The detector is not running" | **Not checked** (needs the Spring Boot backend) |
| 7 | History shows newest first and is still there after restarting the backend | SQL checked on MariaDB; restart persistence **not checked** |
| 8 | "Clear history" empties both tables | Yes (SQL and page) |
| 9 | `mvn test` passes (4 alert-rule tests) | The same 4 cases pass in a plain-Java harness; `mvn test` itself **not run** |
| 10 | `python tools/evaluate.py` on at least 60 of your own labelled photos (with some that have no animal) prints precision and recall, and you write both numbers on your slide | **Not done**: needs your photos. The script itself ran on 4 images only to prove it works. Those 4 numbers mean nothing |

**Set your target before you run criterion 10, write it down, and report the real result even if it is lower.**

## What was and was not tested here

My workspace could reach GitHub and PyPI but not Maven Central, so the Spring Boot project could not be built or started there.

Tested for real:
- the detector (model + pre/post-processing) on three real photos
- every SQL statement and the schema, on MariaDB 10.11
- the web page in a real browser (Chromium, desktop and phone width), with no console errors
- the Java alert rule and its 4 test cases

Tested only through a stand-in: the Spring Boot API. I wrote a throwaway stand-in with the same URLs and JSON, and ran the
page against the real detector and the real database through it.

**Not tested: the Spring Boot code itself** (`ApiController`, `DetectorClient`, `EventRepository`, `pom.xml`). I checked that the
Java files compile against simplified stand-ins for the Spring classes, which catches typos but not mistakes about the real
Spring API. Expect that you may hit a small error on the first `mvn spring-boot:run`. If you do, copy the full error text and
send it to me and we will fix it.
