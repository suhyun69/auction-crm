package com.example.demo.controller.dto;

public record DashboardSummaryWebResponse(long bidCount, long participantCount, long highestAmount,
                                           String highestBidderName) {}
