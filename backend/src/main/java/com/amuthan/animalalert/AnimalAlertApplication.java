package com.amuthan.animalalert;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class AnimalAlertApplication {

    public static void main(String[] args) {
        SpringApplication.run(AnimalAlertApplication.class, args);
    }

    /** Builds the alert rule from application.properties. */
    @Bean
    public AlertRule alertRule(@Value("${alert.min-confidence}") double minConfidence,
                               @Value("${alert.path-left}") double pathLeft,
                               @Value("${alert.path-right}") double pathRight,
                               @Value("${alert.danger-height}") double dangerHeight) {
        return new AlertRule(minConfidence, pathLeft, pathRight, dangerHeight);
    }
}
