package com.example.demo.auction.domain;

import com.example.demo.common.exception.InvalidInputException;

/** 앞뒤 공백을 제거한 이름 자체가 초기 버전의 참가자 식별 기준이다. */
public record CustomerName(String value) {
    public static final int MAX_LENGTH = 100;

    public CustomerName {
        if (value == null) {
            throw new InvalidInputException("customerName은 필수입니다.");
        }
        value = value.strip();
        if (value.isEmpty() || value.length() > MAX_LENGTH) {
            throw new InvalidInputException("customerName은 공백 제거 후 1~100자여야 합니다.");
        }
    }
}
