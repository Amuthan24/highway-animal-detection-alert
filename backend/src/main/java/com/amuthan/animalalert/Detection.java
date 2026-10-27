package com.amuthan.animalalert;

/** One object found by the Python detector (same field names as its JSON). */
public record Detection(String label, int classId, boolean animal, double confidence,
                        int x1, int y1, int x2, int y2) {
}
