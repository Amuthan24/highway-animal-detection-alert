package com.amuthan.animalalert;

import java.util.List;

/** The JSON that the Python detector returns. */
public record DetectorResponse(int width, int height, int inferenceMs, List<Detection> detections) {
}
