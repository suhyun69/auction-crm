package com.example.demo.usecase.dto;

import java.time.Instant;
public record DashboardParticipantAppResponse(long participantId, String customerName, int rank,
        Long highestAcceptedAmount, long bidCount, Instant lastBidAt) {}
