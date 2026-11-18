package com.example.demo.auction.domain;

import com.example.demo.common.exception.InvalidInputException;

/** 원화 정수 금액. JSON에서 정확히 표현 가능한 정수 범위로 제한한다. */
public record BidAmount(long value) {
    public static final long MAX_VALUE = 9_007_199_254_740_991L;

    public BidAmount {
        if (value < 1 || value > MAX_VALUE) {
            throw new InvalidInputException("amount는 1 이상 " + MAX_VALUE + " 이하의 정수여야 합니다.");
        }
    }
}
