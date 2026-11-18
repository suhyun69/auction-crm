package com.example.demo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AuctionWebConfig implements WebMvcConfigurer {
    private final String[] origins;
    public AuctionWebConfig(@Value("${auction.web.allowed-origins:http://localhost:3000}") String[] origins) {
        this.origins = origins;
    }
    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins(origins)
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("Content-Type", "Idempotency-Key").maxAge(300);
    }
    @Bean
    ThreadPoolTaskScheduler auctionSseScheduler() {
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("auction-sse-");
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }
}
