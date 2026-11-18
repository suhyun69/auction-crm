package com.example.demo.auction.adapter.out.persistence;
import com.example.demo.auction.domain.*;
final class AuctionMapper {
    private AuctionMapper() {}
    static Auction toDomain(AuctionJpaEntity e) {
        return Auction.reconstitute(e.getId(), e.getHighestAmount() == null ? null : new BidAmount(e.getHighestAmount()),
            e.getHighestBidderName() == null ? null : new CustomerName(e.getHighestBidderName()),
            e.getHighestBid() == null ? null : e.getHighestBid().getId());
    }
    static Participant toDomain(ParticipantJpaEntity e) {
        return new Participant(e.getId(), new CustomerName(e.getCustomerName()), e.getCreatedAt());
    }
    static Bid toDomain(BidJpaEntity e) {
        return new Bid(e.getId(), e.getParticipant().getId(), new BidDecision(e.getStatus(), e.getReason(),
            new BidAmount(e.getAmount()), new BidAmount(e.getHighestAmount()), new CustomerName(e.getHighestBidderName())),
            e.getCreatedAt(), e.getIdempotencyKey());
    }
}
