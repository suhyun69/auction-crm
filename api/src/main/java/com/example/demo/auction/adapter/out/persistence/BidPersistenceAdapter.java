package com.example.demo.auction.adapter.out.persistence;
import com.example.demo.auction.application.port.out.BidRepositoryPort;
import com.example.demo.auction.domain.Bid;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
public class BidPersistenceAdapter implements BidRepositoryPort {
    private final BidJpaRepository bids;
    private final ParticipantJpaRepository participants;
    BidPersistenceAdapter(BidJpaRepository bids, ParticipantJpaRepository participants) { this.bids = bids; this.participants = participants; }
    public Bid save(Bid bid) {
        if (bid.id() != null) throw new IllegalArgumentException("응찰 기록은 생성 후 수정하지 않습니다.");
        BidJpaEntity e = new BidJpaEntity();
        e.participant = participants.getReferenceById(bid.participantId());
        e.amount = bid.decision().submittedAmount().value();
        e.status = bid.decision().status();
        e.reason = bid.decision().reason();
        e.highestAmount = bid.decision().highestAmount().value();
        e.highestBidderName = bid.decision().highestBidderName().value();
        e.createdAt = bid.createdAt();
        e.idempotencyKey = bid.idempotencyKey();
        return AuctionMapper.toDomain(bids.saveAndFlush(e));
    }
    public Optional<Bid> findById(long id) { return bids.findById(id).map(AuctionMapper::toDomain); }
    public Optional<Bid> findByIdempotencyKey(String key) { return key == null ? Optional.empty() : bids.findByIdempotencyKey(key).map(AuctionMapper::toDomain); }
    public List<Bid> findAll() { return bids.findAllByOrderByIdAsc().stream().map(AuctionMapper::toDomain).toList(); }
}
