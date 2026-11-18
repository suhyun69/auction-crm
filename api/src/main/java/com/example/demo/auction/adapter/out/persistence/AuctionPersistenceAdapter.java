package com.example.demo.auction.adapter.out.persistence;
import com.example.demo.auction.application.port.out.AuctionRepositoryPort;
import com.example.demo.auction.domain.Auction;
import org.springframework.stereotype.Component;
import java.util.Optional;
@Component
public class AuctionPersistenceAdapter implements AuctionRepositoryPort {
    private final AuctionJpaRepository auctions;
    private final BidJpaRepository bids;
    AuctionPersistenceAdapter(AuctionJpaRepository auctions, BidJpaRepository bids) { this.auctions = auctions; this.bids = bids; }
    public Optional<Auction> find() { return auctions.findById(Auction.DEFAULT_ID).map(AuctionMapper::toDomain); }
    public Auction findForUpdate() {
        return AuctionMapper.toDomain(auctions.findForUpdate().orElseThrow(() -> new IllegalStateException("경매가 초기화되지 않았습니다.")));
    }
    public Auction save(Auction auction) {
        AuctionJpaEntity entity = auctions.findById(auction.getId()).orElseGet(AuctionJpaEntity::new);
        entity.id = auction.getId();
        entity.highestAmount = auction.getHighestAmount() == null ? null : auction.getHighestAmount().value();
        entity.highestBidderName = auction.getHighestBidderName() == null ? null : auction.getHighestBidderName().value();
        entity.highestBid = auction.getHighestBidId() == null ? null : bids.getReferenceById(auction.getHighestBidId());
        return AuctionMapper.toDomain(auctions.saveAndFlush(entity));
    }
}
