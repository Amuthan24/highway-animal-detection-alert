package com.amuthan.animalalert;

/**
 * The alert rule. This is plain Java (no Spring), so it is easy to read and test.
 *
 * DANGER  = animal is inside "my lane" zone AND looks close (its box is tall).
 * CAUTION = any other animal that was detected.
 * SAFE    = no animal.
 *
 * "Close" is guessed from box height / picture height. This is a rough heuristic,
 * not a measured distance.
 */
public class AlertRule {

    private final double minConfidence;
    private final double pathLeft;
    private final double pathRight;
    private final double dangerHeight;

    public AlertRule(double minConfidence, double pathLeft, double pathRight, double dangerHeight) {
        this.minConfidence = minConfidence;
        this.pathLeft = pathLeft;
        this.pathRight = pathRight;
        this.dangerHeight = dangerHeight;
    }

    public double minConfidence() {
        return minConfidence;
    }

    /** Level for one detected animal. */
    public Level classify(Detection d, int imageWidth, int imageHeight) {
        double centerX = (d.x1() + d.x2()) / 2.0 / imageWidth;
        double heightRatio = (double) (d.y2() - d.y1()) / imageHeight;

        boolean inMyLane = centerX >= pathLeft && centerX <= pathRight;
        boolean close = heightRatio >= dangerHeight;

        if (inMyLane && close) {
            return Level.DANGER;
        }
        return Level.CAUTION;
    }

    /** Message shown to the driver. label = the most dangerous animal (or null when SAFE). */
    public String message(Level level, String label) {
        if (level == Level.DANGER) {
            return "DANGER: " + label + " in your lane and close. Slow down now!";
        }
        if (level == Level.CAUTION) {
            return "CAUTION: " + label + " near the road. Be ready to slow down.";
        }
        return "No animals detected. Drive safe.";
    }
}
