package com.example.demo.usecase.dto;

import com.example.demo.auction.domain.Bid;

public record BidAppResponse(long bidId, String status, String reason, long submittedAmount,
                             long highestAmount, String highestBidderName) {
    public static BidAppResponse from(Bid bid) {
        var decision = bid.decision();
        return new BidAppResponse(bid.id(), decision.status().name(), decision.reason().name(),
                decision.submittedAmount().value(), decision.highestAmount().value(),
                decision.highestBidderName().value());
    }
}
