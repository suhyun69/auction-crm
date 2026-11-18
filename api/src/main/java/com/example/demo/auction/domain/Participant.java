package com.example.demo.auction.domain;

import java.time.Instant;
import java.util.Objects;

public record Participant(Long id, CustomerName customerName, Instant createdAt) {
    public Participant {
        if (id != null && id < 1) {
            throw new IllegalArgumentException("participant id는 양수여야 합니다.");
        }
        Objects.requireNonNull(customerName, "customerName");
        Objects.requireNonNull(createdAt, "createdAt");
    }

    public static Participant create(CustomerName customerName, Instant now) {
        return new Participant(null, customerName, now);
    }
}
