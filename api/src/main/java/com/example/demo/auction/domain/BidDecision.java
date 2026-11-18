package com.example.demo.auction.domain;

import java.util.Objects;

/** 판정 당시 최고가를 보존한다. 이후 응찰이 있어도 기존 결과는 바뀌지 않는다. */
public record BidDecision(BidStatus status, BidReason reason, BidAmount submittedAmount,
                          BidAmount highestAmount, CustomerName highestBidderName) {
    public BidDecision {
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(reason, "reason");
        Objects.requireNonNull(submittedAmount, "submittedAmount");
        Objects.requireNonNull(highestAmount, "highestAmount");
        Objects.requireNonNull(highestBidderName, "highestBidderName");
        boolean accepted = status == BidStatus.ACCEPTED;
        if (accepted != (reason == BidReason.NEW_HIGHEST_BID)
                || (accepted && submittedAmount.value() != highestAmount.value())
                || (!accepted && submittedAmount.value() > highestAmount.value())) {
            throw new IllegalArgumentException("응찰 상태, 사유 및 최고 금액이 일치하지 않습니다.");
        }
    }
}
