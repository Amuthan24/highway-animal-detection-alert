package com.amuthan.animalalert;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ApiController {

    /** One animal in the answer sent to the browser. */
    public record AnimalResult(String label, double confidence, int x1, int y1, int x2, int y2, String severity) {
    }

    /** The full answer of POST /api/detect. */
    public record DetectResult(long eventId, String alertLevel, String message, int imageWidth,
                               int imageHeight, int inferenceMs, List<AnimalResult> animals) {
    }

    private final DetectorClient detector;
    private final AlertRule rule;
    private final EventRepository repository;

    public ApiController(DetectorClient detector, AlertRule rule, EventRepository repository) {
        this.detector = detector;
        this.rule = rule;
        this.repository = repository;
    }

    /** Main feature: photo in, detections + alert out, and the result is saved in MySQL. */
    @PostMapping("/detect")
    public DetectResult detect(@RequestParam("image") MultipartFile image,
                               @RequestParam(value = "location", defaultValue = "") String location,
                               @RequestParam(value = "save", defaultValue = "true") boolean save)
            throws IOException {
        if (image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please choose an image first.");
        }

        DetectorResponse found = detector.detect(image.getBytes());

        List<AnimalResult> animals = new ArrayList<>();
        List<Detection> kept = new ArrayList<>();
        List<Level> levels = new ArrayList<>();
        Level overall = Level.SAFE;
        String worstLabel = null;

        for (Detection d : found.detections()) {
            if (!d.animal() || d.confidence() < rule.minConfidence()) {
                continue; // not an animal, or not sure enough
            }
            Level level = rule.classify(d, found.width(), found.height());
            kept.add(d);
            levels.add(level);
            animals.add(new AnimalResult(d.label(), d.confidence(), d.x1(), d.y1(), d.x2(), d.y2(), level.name()));
            if (level.compareTo(overall) > 0 || worstLabel == null) {
                overall = level;
                worstLabel = d.label();
            }
        }

        // Video mode sends many frames and passes save=false, so nothing is written to MySQL for them.
        long eventId = 0;
        if (save) {
            String name = image.getOriginalFilename() == null ? "image" : image.getOriginalFilename();
            eventId = repository.saveEvent(name, location.trim(), found.width(), found.height(),
                    overall, kept.size(), found.inferenceMs());
            for (int i = 0; i < kept.size(); i++) {
                repository.saveAnimal(eventId, kept.get(i), levels.get(i));
            }
        }

        return new DetectResult(eventId, overall.name(), rule.message(overall, worstLabel),
                found.width(), found.height(), found.inferenceMs(), animals);
    }

    /** What the page sends to save a video moment it already analysed (no second detection run). */
    public record SaveRequest(String name, String location, int imageWidth, int imageHeight,
                              int inferenceMs, List<AnimalResult> animals) {
    }

    /** Video mode: saves one moment (the page decides when) as an event with its animals. */
    @PostMapping("/events")
    public Map<String, Object> saveVideoEvent(@RequestBody SaveRequest request) {
        List<AnimalResult> animals = request.animals();
        if (animals == null || animals.isEmpty() || animals.size() > 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An event needs 1 to 50 animals.");
        }
        if (request.imageWidth() <= 0 || request.imageHeight() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image size is missing.");
        }

        Level overall = Level.SAFE;
        List<Level> levels = new ArrayList<>();
        for (AnimalResult a : animals) {
            if (a.label() == null || a.label().isBlank() || a.label().length() > 30
                    || a.confidence() < 0 || a.confidence() > 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An animal entry is not valid.");
            }
            Level level;
            try {
                level = Level.valueOf(String.valueOf(a.severity()));
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown alert level: " + a.severity());
            }
            levels.add(level);
            if (level.compareTo(overall) > 0) {
                overall = level;   // the event takes the worst animal's level, like photo mode
            }
        }

        long eventId = repository.saveEvent(clip(request.name(), 255, "video frame"), clip(request.location(), 120, ""),
                request.imageWidth(), request.imageHeight(), overall, animals.size(), Math.max(0, request.inferenceMs()));
        for (int i = 0; i < animals.size(); i++) {
            AnimalResult a = animals.get(i);
            repository.saveAnimal(eventId, new Detection(a.label(), 0, true, a.confidence(), a.x1(), a.y1(), a.x2(), a.y2()),
                    levels.get(i));
        }
        return Map.of("eventId", eventId, "alertLevel", overall.name());
    }

    /** Trims text to the column size and uses a fallback when it is missing. */
    private static String clip(String text, int max, String fallback) {
        if (text == null || text.isBlank()) {
            return fallback;
        }
        String trimmed = text.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    @GetMapping("/events")
    public List<EventRepository.EventRow> events(@RequestParam(value = "limit", defaultValue = "20") int limit) {
        return repository.latest(Math.max(1, Math.min(limit, 100)));
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("byAnimal", repository.countByAnimal());
        result.put("byLevel", repository.countByLevel());
        return result;
    }

    @DeleteMapping("/events")
    public Map<String, String> clearHistory() {
        repository.deleteAll();
        return Map.of("status", "cleared");
    }

    /** Used by the green/red dots at the top of the page. */
    @GetMapping("/health")
    public Map<String, String> health() {
        Map<String, String> result = new LinkedHashMap<>();
        result.put("backend", "up");
        result.put("detector", detector.isUp() ? "up" : "down");
        result.put("database", repository.databaseIsUp() ? "up" : "down");
        return result;
    }
}
