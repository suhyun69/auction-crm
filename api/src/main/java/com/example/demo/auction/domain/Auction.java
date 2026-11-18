package com.example.demo.auction.domain;

import java.util.Objects;

/** 최고가 판정만 담당한다. 저장과 동시성 제어는 유스케이스·어댑터 책임이다. */
public final class Auction {
    public static final long DEFAULT_ID = 1L;

    private final long id;
    private BidAmount highestAmount;
    private CustomerName highestBidderName;
    private Long highestBidId;

    private Auction(long id, BidAmount highestAmount, CustomerName highestBidderName) {
        if (id < 1 || (highestAmount == null) != (highestBidderName == null)) {
            throw new IllegalArgumentException("유효한 경매 ID와 일관된 최고가 정보가 필요합니다.");
        }
        this.id = id;
        this.highestAmount = highestAmount;
        this.highestBidderName = highestBidderName;
    }

    public static Auction create() {
        return new Auction(DEFAULT_ID, null, null);
    }

    public static Auction reconstitute(long id, BidAmount highestAmount, CustomerName highestBidderName) {
        return new Auction(id, highestAmount, highestBidderName);
    }

    public static Auction reconstitute(long id, BidAmount amount, CustomerName name, Long bidId) {
        Auction auction = new Auction(id, amount, name);
        if (bidId != null && (bidId < 1 || amount == null)) {
            throw new IllegalArgumentException("최고 응찰 참조가 유효하지 않습니다.");
        }
        auction.highestBidId = bidId;
        return auction;
    }

    public void linkHighestBid(long bidId) {
        if (bidId < 1 || highestAmount == null) {
            throw new IllegalArgumentException("최고 응찰 참조가 유효하지 않습니다.");
        }
        highestBidId = bidId;
    }

    public Long getHighestBidId() { return highestBidId; }

    public BidDecision bid(CustomerName customerName, BidAmount amount) {
        Objects.requireNonNull(customerName, "customerName");
        Objects.requireNonNull(amount, "amount");
        if (highestAmount == null || amount.value() > highestAmount.value()) {
            highestBidId = null;
            highestAmount = amount;
            highestBidderName = customerName;
            return new BidDecision(BidStatus.ACCEPTED, BidReason.NEW_HIGHEST_BID,
                    amount, highestAmount, highestBidderName);
        }
        return new BidDecision(BidStatus.REJECTED, BidReason.AMOUNT_NOT_HIGH_ENOUGH,
                amount, highestAmount, highestBidderName);
    }

    public long getId() { return id; }
    public BidAmount getHighestAmount() { return highestAmount; }
    public CustomerName getHighestBidderName() { return highestBidderName; }
}
