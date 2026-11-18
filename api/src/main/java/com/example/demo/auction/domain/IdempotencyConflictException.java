package com.example.demo.auction.domain;

import com.example.demo.common.exception.BusinessException;
import com.example.demo.common.exception.ErrorCode;

public final class IdempotencyConflictException extends BusinessException {
    public IdempotencyConflictException() {
        super(ErrorCode.CONFLICT, "동일한 Idempotency-Key가 다른 응찰 요청에 사용되었습니다.");
    }
}
