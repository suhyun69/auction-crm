package com.example.demo.usecase.dto;

public record SubmitBidAppRequest(String customerName, long amount, String idempotencyKey) {}
