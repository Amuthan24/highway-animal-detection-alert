-- Run once:  mysql -u root -p < database/schema.sql
CREATE DATABASE IF NOT EXISTS animal_alert CHARACTER SET utf8mb4;
USE animal_alert;

-- One row per photo that was checked
CREATE TABLE IF NOT EXISTS detection_event (
    id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    image_name     VARCHAR(255) NOT NULL,
    location_label VARCHAR(120) NOT NULL DEFAULT '',
    image_width    INT          NOT NULL,
    image_height   INT          NOT NULL,
    alert_level    VARCHAR(10)  NOT NULL,          -- SAFE, CAUTION or DANGER
    animal_count   INT          NOT NULL,
    inference_ms   INT          NOT NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per animal found in a photo
CREATE TABLE IF NOT EXISTS detected_animal (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id   BIGINT       NOT NULL,
    label      VARCHAR(30)  NOT NULL,              -- dog, cow, horse ...
    confidence DECIMAL(5,4) NOT NULL,
    x1 INT NOT NULL, y1 INT NOT NULL, x2 INT NOT NULL, y2 INT NOT NULL,
    severity   VARCHAR(10)  NOT NULL,
    CONSTRAINT fk_animal_event FOREIGN KEY (event_id)
        REFERENCES detection_event (id) ON DELETE CASCADE
);

CREATE INDEX idx_event_created ON detection_event (created_at);
