package com.example.demo.auction.domain;

import java.time.Instant;
import java.util.Objects;

/** 승인과 기각을 모두 기록하며 판정 시점의 결과를 보존한다. */
public record Bid(Long id, long participantId, BidDecision decision, Instant createdAt) {
    public Bid {
        if ((id != null && id < 1) || participantId < 1) {
            throw new IllegalArgumentException("bid 및 participant id는 양수여야 합니다.");
        }
        Objects.requireNonNull(decision, "decision");
        Objects.requireNonNull(createdAt, "createdAt");
    }

    public static Bid create(long participantId, BidDecision decision, Instant now) {
        return new Bid(null, participantId, decision, now);
    }
}
