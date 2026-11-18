package com.example.demo.controller.dto;

import java.time.Instant;
public record DashboardParticipantWebResponse(long participantId, String customerName, int rank,
        Long highestAcceptedAmount, long bidCount, Instant lastBidAt) {}
