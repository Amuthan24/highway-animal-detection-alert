// Plain JavaScript front end. It talks to the Spring Boot REST API under /api.

const $ = (id) => document.getElementById(id);
const COLORS = { SAFE: "#6fbf8f", CAUTION: "#e8a93b", DANGER: "#e5484d" };

// The fine line under the header takes the colour of the latest alert.
function setCoachline(level) {
  const line = $("coachline");
  if (line) line.dataset.level = level;
}

// ---------- system status dots ----------
async function loadHealth() {
  let health = { backend: "down", detector: "down", database: "down" };
  try {
    const res = await fetch("/api/health");
    if (res.ok) health = await res.json();
  } catch (e) { /* backend not reachable */ }
  for (const name of ["backend", "detector", "database"]) {
    $("dot-" + name).className = "dot " + (health[name] === "up" ? "up" : "down");
  }
}

// ---------- beep (only used for DANGER) ----------
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.3);
      osc.stop(ctx.currentTime + i * 0.3 + 0.18);
    }
  } catch (e) { /* sound is optional */ }
}

// ---------- draw the boxes (used by photo mode and video mode) ----------
function drawBoxes(ctx, width, animals) {
  const line = Math.max(3, Math.round(width / 200));
  const font = Math.max(14, Math.round(width / 40));
  ctx.lineWidth = line;
  ctx.font = "bold " + font + "px sans-serif";
  ctx.textBaseline = "top";

  for (const a of animals) {
    const color = COLORS[a.severity];
    ctx.strokeStyle = color;
    ctx.strokeRect(a.x1, a.y1, a.x2 - a.x1, a.y2 - a.y1);
    const text = a.label + " " + Math.round(a.confidence * 100) + "%";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = color;
    ctx.fillRect(a.x1, Math.max(0, a.y1 - font - 6), w, font + 6);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillText(text, a.x1 + 5, Math.max(0, a.y1 - font - 6) + 3);
  }
}

// ---------- show the photo with boxes ----------
function drawResult(img, data) {
  const canvas = $("canvas");
  canvas.width = data.imageWidth;
  canvas.height = data.imageHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawBoxes(ctx, canvas.width, data.animals);
}

function showBanner(level, text) {
  const banner = $("banner");
  banner.className = "banner " + level;
  banner.textContent = text;
  setCoachline(level);
}

// ---------- check a photo ----------
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = $("image").files[0];
  if (!file) return;

  $("go").disabled = true;
  $("go").textContent = "Checking...";
  showBanner("idle", "Looking for animals...");
  $("meta").textContent = "";

  const form = new FormData();
  form.append("image", file);
  form.append("location", $("location").value);

  try {
    const res = await fetch("/api/detect", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Something went wrong");

    const img = new Image();
    img.onload = () => {
      drawResult(img, data);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);

    showBanner(data.alertLevel, data.message);
    $("meta").textContent = data.animals.length + " animal(s) found. Model time: " + data.inferenceMs + " ms.";
    if (data.alertLevel === "DANGER" && $("sound").checked) beep();
    loadHistory();
    loadStats();
  } catch (err) {
    showBanner("idle", "Error: " + err.message);
  } finally {
    $("go").disabled = false;
    $("go").textContent = "Check for animals";
  }
});

// ---------- video mode (only important moments are saved to MySQL) ----------
const FRAME_WIDTH = 640;   // each frame is shrunk to this width before it is sent (small upload, same size the model uses)
const SAVE_COOLDOWN_MS = 5000;   // never save more often than this
const LEVEL_RANK = { SAFE: 0, CAUTION: 1, DANGER: 2 };
const video = $("video");
const overlay = $("overlay");
let videoRunning = false;
let videoRunId = 0;        // stops an old loop from mixing with a new one after Stop then Start
let lastBeep = 0;
let sourceKind = null;     // what is loaded: "file" (a clip), "webcam", or null (nothing yet)
let cameraStream = null;   // the open camera, while the webcam is on

// "Smart saving" state. One "sighting" = animals seen over several frames in a row.
let sightingLevel = -1;    // worst level already saved for the current sighting (-1 = no sighting going on)
let emptyFrames = 0;       // frames in a row without any animal
let lastSaveAt = 0;
let savedCount = 0;

function resetSaving() {
  sightingLevel = -1;
  emptyFrames = 0;
  lastSaveAt = 0;
  savedCount = 0;
  $("vsave").textContent = "";
}

function clock(seconds) {
  const s = Math.floor(seconds);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/** Where we are right now: a time inside the clip, or the time of day for the webcam. Used to label saved moments. */
function describeMoment() {
  if (sourceKind === "webcam") {
    const now = new Date().toLocaleTimeString();
    return { name: "webcam @ " + now, place: "webcam " + now, short: now };
  }
  const file = $("vfile").files[0];
  const t = video.currentTime;
  return {
    name: "video: " + (file ? file.name : "clip") + " @ " + t.toFixed(1) + "s",
    place: "video " + clock(t),
    short: clock(t),
  };
}

/** Save only when a new sighting starts or its alert level gets worse, and not more than once per cooldown. */
function maybeSave(data, moment) {
  if (data.animals.length === 0) {
    emptyFrames++;
    if (emptyFrames >= 2) sightingLevel = -1;   // animals are gone, so the next one counts as new
    return;
  }
  emptyFrames = 0;
  const rank = LEVEL_RANK[data.alertLevel];
  if (rank <= sightingLevel) return;                          // same sighting, not worse
  if (Date.now() - lastSaveAt < SAVE_COOLDOWN_MS) return;     // too soon; a later frame will try again
  sightingLevel = rank;
  lastSaveAt = Date.now();
  saveMoment(data, moment);
}

async function saveMoment(data, moment) {
  const place = $("location").value.trim();
  try {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: moment.name,
        location: (place ? place + " - " : "") + moment.place,
        imageWidth: data.imageWidth,
        imageHeight: data.imageHeight,
        inferenceMs: data.inferenceMs,
        animals: data.animals,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Could not save");
    }
    savedCount++;
    $("vsave").textContent = "Saved to History: " + savedCount + " moment(s). Latest: " + data.alertLevel + " at " + moment.short + ".";
    loadHistory();
    loadStats();
  } catch (err) {
    sightingLevel = -1;   // try again on a later frame
    $("vsave").textContent = "Could not save to History: " + err.message;
  }
}

function showVideoBanner(level, text) {
  const banner = $("vbanner");
  banner.className = "banner " + level;
  banner.textContent = text;
  setCoachline(level);
}

function setVideoButtons(running) {
  $("vstart").disabled = running || sourceKind === null;
  $("vstop").disabled = !running;
  $("vfile").disabled = running;
  $("vcam").disabled = running;
  $("vcamoff").hidden = sourceKind !== "webcam";
  $("vcamoff").disabled = running;
}

function clearOverlay() {
  overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
}

function stopVideo() {
  videoRunning = false;
  video.pause();
  setVideoButtons(false);
}

/** Lets go of whatever is loaded (a clip or the camera). The camera light goes off here. */
function releaseSource() {
  stopVideo();
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  video.srcObject = null;
  if (video.src) {
    URL.revokeObjectURL(video.src);
    video.removeAttribute("src");
    video.load();
  }
  sourceKind = null;
  setVideoButtons(false);
}

$("vfile").addEventListener("change", () => {
  const file = $("vfile").files[0];
  if (!file) return;
  releaseSource();
  sourceKind = "file";
  video.src = URL.createObjectURL(file);
  clearOverlay();
  $("vmeta").textContent = "";
  showVideoBanner("idle", "Loading video...");
});

function cameraErrorText(err) {
  switch (err && err.name) {
    case "NotAllowedError":
      return "The camera is blocked. Click the camera icon in the address bar and choose Allow, then press 'Use webcam' again. "
        + "Also check Windows Settings > Privacy & security > Camera.";
    case "NotFoundError":
      return "No camera was found on this computer.";
    case "NotReadableError":
      return "The camera is busy. Close other programs that use it (Zoom, Teams, the Camera app) and try again.";
    default:
      return "Could not start the camera: " + (err && err.message ? err.message : err);
  }
}

$("vcam").addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showVideoBanner("idle", "This page cannot use the camera here. Open it as http://localhost:8080 (not with an IP address).");
    return;
  }
  releaseSource();
  $("vfile").value = "";   // forget the clip that was chosen
  clearOverlay();
  $("vmeta").textContent = "";
  resetSaving();
  showVideoBanner("idle", "Asking for the camera... choose Allow in the browser.");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    showVideoBanner("idle", cameraErrorText(err));
    return;
  }
  sourceKind = "webcam";
  video.srcObject = cameraStream;
  try {
    await video.play();   // live preview
  } catch (e) { /* the Start button will try again */ }
  setVideoButtons(false);
});

$("vcamoff").addEventListener("click", () => {
  releaseSource();
  clearOverlay();
  showVideoBanner("idle", "Camera is off.");
});

video.addEventListener("loadedmetadata", () => {
  setVideoButtons(false);
  showVideoBanner("idle", sourceKind === "webcam" ? "Camera is on. Press Start to look for animals." : "Press Start.");
});

video.addEventListener("error", () => {
  if (sourceKind !== "file") return;
  setVideoButtons(false);
  showVideoBanner("idle", "This browser cannot play that file. Try an mp4 (H.264) or webm video.");
});

$("vstart").addEventListener("click", async () => {
  if (sourceKind === "file" && video.ended) video.currentTime = 0;
  videoRunning = true;
  const runId = ++videoRunId;
  setVideoButtons(true);
  clearOverlay();
  resetSaving();
  try {
    await video.play();
  } catch (e) {
    stopVideo();
    showVideoBanner("idle", "Could not play the video: " + e.message);
    return;
  }
  videoLoop(runId);
});

$("vstop").addEventListener("click", () => {
  stopVideo();
  showVideoBanner("idle", "Stopped.");
});

function showVideoResult(data) {
  overlay.width = data.imageWidth;    // changing the size also clears the old boxes
  overlay.height = data.imageHeight;
  drawBoxes(overlay.getContext("2d"), overlay.width, data.animals);
  showVideoBanner(data.alertLevel, data.message);
  if (data.alertLevel === "DANGER" && $("sound").checked && Date.now() - lastBeep > 3000) {
    lastBeep = Date.now();
    beep();
  }
}

/** Grab a frame, send it, show the answer, then grab the next frame. Only one frame is in flight at a time. */
async function videoLoop(runId) {
  const grab = document.createElement("canvas");
  const gctx = grab.getContext("2d");
  const began = performance.now();
  let checked = 0;
  let failed = false;

  while (videoRunning && runId === videoRunId && !video.ended) {
    if (!video.videoWidth) {   // the camera has not delivered a picture yet
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    const t0 = performance.now();
    const moment = describeMoment();   // the moment this frame comes from (clip time or time of day)
    const w = Math.min(FRAME_WIDTH, video.videoWidth);
    const h = Math.round((w * video.videoHeight) / video.videoWidth);
    grab.width = w;
    grab.height = h;
    gctx.drawImage(video, 0, 0, w, h);
    try {
      const blob = await new Promise((resolve) => grab.toBlob(resolve, "image/jpeg", 0.8));
      const form = new FormData();
      form.append("image", blob, "frame.jpg");
      form.append("save", "false");
      const res = await fetch("/api/detect", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");
      if (!videoRunning || runId !== videoRunId) break;   // Stop was pressed while waiting
      showVideoResult(data);
      maybeSave(data, moment);
      checked++;
      const total = Math.round(performance.now() - t0);
      const perSecond = (checked / ((performance.now() - began) / 1000)).toFixed(1);
      $("vmeta").textContent = "Frames checked: " + checked + " (about " + perSecond + " per second). Last frame: model "
        + data.inferenceMs + " ms, whole round trip " + total + " ms.";
    } catch (err) {
      failed = true;
      showVideoBanner("idle", "Error: " + err.message);
      break;
    }
  }

  if (runId !== videoRunId) return;   // a newer run owns the buttons now
  stopVideo();
  if (!failed && sourceKind === "file" && video.ended) showVideoBanner("idle", "Video finished.");
}

// ---------- history table ----------
function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

async function loadHistory() {
  const body = $("history");
  try {
    const res = await fetch("/api/events?limit=20");
    const rows = await res.json();
    body.replaceChildren();
    if (rows.length === 0) {
      const tr = document.createElement("tr");
      const td = cell("Nothing yet. Check a photo above.");
      td.colSpan = 4;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.appendChild(cell(new Date(r.createdAt).toLocaleString()));
      tr.appendChild(cell(r.location || "-"));
      tr.appendChild(cell(r.animals || "none"));
      const td = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "pill " + r.alertLevel;
      pill.textContent = r.alertLevel;
      td.appendChild(pill);
      tr.appendChild(td);
      body.appendChild(tr);
    }
  } catch (e) {
    body.replaceChildren();
  }
}

// ---------- stats bars ----------
function drawBars(container, rows, nameKey, colorByName) {
  container.replaceChildren();
  if (rows.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No data yet.";
    container.appendChild(p);
    return;
  }
  const max = Math.max(...rows.map((r) => r.total));
  for (const r of rows) {
    const bar = document.createElement("div");
    bar.className = "bar";
    const name = document.createElement("span");
    name.textContent = r[nameKey];
    const track = document.createElement("div");
    track.className = "track";
    const fill = document.createElement("div");
    fill.className = "fill" + (colorByName ? " " + r[nameKey] : "");
    fill.style.width = (r.total / max) * 100 + "%";
    track.appendChild(fill);
    const count = document.createElement("span");
    count.textContent = r.total;
    bar.append(name, track, count);
    container.appendChild(bar);
  }
}

async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    drawBars($("stats-animals"), data.byAnimal, "label", false);
    drawBars($("stats-levels"), data.byLevel, "alert_level", true);
  } catch (e) { /* ignore */ }
}

// ---------- clear history ----------
$("clear").addEventListener("click", async () => {
  if (!confirm("Delete all saved history?")) return;
  await fetch("/api/events", { method: "DELETE" });
  loadHistory();
  loadStats();
});

loadHealth();
loadHistory();
loadStats();
setInterval(loadHealth, 10000);


// ---------- which picture is on show (only matters on the one-screen PC layout) ----------
function setView(view) {
  $("board").dataset.view = view;
  for (const tab of document.querySelectorAll(".tab[data-view]")) {
    tab.setAttribute("aria-pressed", String(tab.dataset.view === view));
  }
  if (view === "photo" && !$("vstop").disabled) $("vstop").click();   // do not keep analysing a hidden video
}
for (const tab of document.querySelectorAll(".tab[data-view]")) {
  tab.addEventListener("click", () => setView(tab.dataset.view));
}
$("image").addEventListener("change", () => setView("photo"));
$("form").addEventListener("submit", () => setView("photo"));
$("vfile").addEventListener("change", () => setView("live"));
$("vcam").addEventListener("click", () => setView("live"));
$("vstart").addEventListener("click", () => setView("live"));
