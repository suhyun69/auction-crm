package com.example.demo.auction.domain;

import java.time.Instant;

/** 동일 SQL 스냅샷에서 집계한 개인 응찰 현황. */
public record ParticipantStanding(long participantId, String customerName, Instant createdAt,
                                  Long highestAcceptedAmount, long bidCount, Instant lastBidAt) {}
