package com.amuthan.animalalert;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.stereotype.Repository;

/** All MySQL access lives here, written as plain SQL. */
@Repository
public class EventRepository {

    /** One row of the history table. */
    public record EventRow(long id, String imageName, String location, String alertLevel,
                           int animalCount, String createdAt, String animals) {
    }

    private final JdbcTemplate jdbc;
    private final SimpleJdbcInsert insertEvent;

    public EventRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.insertEvent = new SimpleJdbcInsert(jdbc)
        .withTableName("detection_event")
        .usingColumns(
                "image_name",
                "location_label",
                "image_width",
                "image_height",
                "alert_level",
                "animal_count",
                "inference_ms"
        )
        .usingGeneratedKeyColumns("id");
    }

    /** Saves one checked photo and returns its new id. */
    public long saveEvent(String imageName, String location, int width, int height,
                          Level level, int animalCount, int inferenceMs) {
        Map<String, Object> row = new HashMap<>();
        row.put("image_name", imageName);
        row.put("location_label", location);
        row.put("image_width", width);
        row.put("image_height", height);
        row.put("alert_level", level.name());
        row.put("animal_count", animalCount);
        row.put("inference_ms", inferenceMs);
        return insertEvent.executeAndReturnKey(row).longValue();
    }

    /** Saves one detected animal of an event. */
    public void saveAnimal(long eventId, Detection d, Level severity) {
        jdbc.update("INSERT INTO detected_animal (event_id, label, confidence, x1, y1, x2, y2, severity) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                eventId, d.label(), d.confidence(), d.x1(), d.y1(), d.x2(), d.y2(), severity.name());
    }

    /** Newest events first, with the animal names joined into one text. */
    public List<EventRow> latest(int limit) {
        String sql = """
                SELECT e.id, e.image_name, e.location_label, e.alert_level, e.animal_count, e.created_at,
                       (SELECT GROUP_CONCAT(a.label ORDER BY a.id SEPARATOR ', ')
                          FROM detected_animal a WHERE a.event_id = e.id) AS animals
                FROM detection_event e
                ORDER BY e.id DESC
                LIMIT ?
                """;
        return jdbc.query(sql, (rs, rowNum) -> new EventRow(
                rs.getLong("id"),
                rs.getString("image_name"),
                rs.getString("location_label"),
                rs.getString("alert_level"),
                rs.getInt("animal_count"),
                rs.getTimestamp("created_at").toLocalDateTime().toString(),
                rs.getString("animals")), limit);
    }

    public List<Map<String, Object>> countByAnimal() {
        return jdbc.queryForList(
                "SELECT label, COUNT(*) AS total FROM detected_animal GROUP BY label ORDER BY total DESC");
    }

    public List<Map<String, Object>> countByLevel() {
        return jdbc.queryForList(
                "SELECT alert_level, COUNT(*) AS total FROM detection_event GROUP BY alert_level");
    }

    public void deleteAll() {
        jdbc.update("DELETE FROM detection_event"); // detected_animal rows go with it (ON DELETE CASCADE)
    }

    public boolean databaseIsUp() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
