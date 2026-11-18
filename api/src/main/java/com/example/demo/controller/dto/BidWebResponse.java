package com.example.demo.controller.dto;

import com.example.demo.usecase.dto.BidAppResponse;
import io.swagger.v3.oas.annotations.media.Schema;

public record BidWebResponse(
        @Schema(example = "42") long bidId,
        @Schema(example = "ACCEPTED", allowableValues = {"ACCEPTED", "REJECTED"}) String status,
        @Schema(example = "NEW_HIGHEST_BID", allowableValues = {"NEW_HIGHEST_BID", "AMOUNT_NOT_HIGH_ENOUGH"}) String reason,
        @Schema(example = "150000") long submittedAmount,
        @Schema(description = "해당 응찰의 최초 판정 시점 최고가", example = "150000") long highestAmount,
        @Schema(example = "홍길동") String highestBidderName) {
    public static BidWebResponse from(BidAppResponse result) {
        return new BidWebResponse(result.bidId(), result.status(), result.reason(), result.submittedAmount(),
                result.highestAmount(), result.highestBidderName());
    }
}
