package com.example.demo.controller.dto;

import com.example.demo.controller.serialization.BidRequestDeserializer;
import com.example.demo.usecase.dto.SubmitBidAppRequest;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import io.swagger.v3.oas.annotations.media.Schema;

@JsonDeserialize(using = BidRequestDeserializer.class)
public record BidWebRequest(
        @Schema(description = "앞뒤 공백 제거 후 1~100자 고객 이름", example = "홍길동", requiredMode = Schema.RequiredMode.REQUIRED)
        String customerName,
        @Schema(description = "원화 정수 금액. 소수와 문자열은 허용하지 않음", example = "150000", minimum = "1", maximum = "9007199254740991", requiredMode = Schema.RequiredMode.REQUIRED)
        long amount) {
    public SubmitBidAppRequest toAppRequest(String key) {
        return new SubmitBidAppRequest(customerName, amount, key);
    }
}
