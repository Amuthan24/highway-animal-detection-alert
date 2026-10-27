package com.amuthan.animalalert;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

/** Talks to the Python detector (detector/app.py). */
@Component
public class DetectorClient {

    private final RestClient client;

    public DetectorClient(RestClient.Builder builder, @Value("${detector.url}") String url) {
        this.client = builder.baseUrl(url).build();
    }

    /** Send the image bytes, get the detections back. */
    public DetectorResponse detect(byte[] imageBytes) {
        try {
            return client.post()
                    .uri("/detect")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(imageBytes)
                    .retrieve()
                    .body(DetectorResponse.class);
        } catch (RestClientResponseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The detector could not read this image. Use a JPG or PNG.");
        } catch (ResourceAccessException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The detector is not running. Start it with: python app.py (in the detector folder).");
        }
    }

    public boolean isUp() {
        try {
            client.get().uri("/health").retrieve().toBodilessEntity();
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
