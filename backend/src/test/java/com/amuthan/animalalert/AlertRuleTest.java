package com.amuthan.animalalert;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AlertRuleTest {

    // lane = middle 50% of the width, "close" = box at least 25% of the picture height
    private final AlertRule rule = new AlertRule(0.40, 0.25, 0.75, 0.25);

    private Detection dog(int x1, int y1, int x2, int y2) {
        return new Detection("dog", 16, true, 0.90, x1, y1, x2, y2);
    }

    @Test
    void closeAndInMyLaneIsDanger() {
        // picture 1000 x 600: box centre x = 0.50, height = 300/600 = 0.50
        assertEquals(Level.DANGER, rule.classify(dog(400, 200, 600, 500), 1000, 600));
    }

    @Test
    void farAwayInMyLaneIsOnlyCaution() {
        // height = 60/600 = 0.10 -> far
        assertEquals(Level.CAUTION, rule.classify(dog(470, 300, 530, 360), 1000, 600));
    }

    @Test
    void closeButOnTheSideIsOnlyCaution() {
        // centre x = 0.10 -> outside my lane
        assertEquals(Level.CAUTION, rule.classify(dog(50, 200, 150, 500), 1000, 600));
    }

    @Test
    void messagesMentionTheAnimal() {
        assertEquals("No animals detected. Drive safe.", rule.message(Level.SAFE, null));
        assertEquals("DANGER: dog in your lane and close. Slow down now!", rule.message(Level.DANGER, "dog"));
    }
}
