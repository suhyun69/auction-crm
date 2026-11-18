package com.example.demo.auction.adapter.out.persistence;
import com.example.demo.auction.application.port.out.ParticipantRepositoryPort;
import com.example.demo.auction.domain.*;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
public class ParticipantPersistenceAdapter implements ParticipantRepositoryPort {
    private final ParticipantJpaRepository participants;
    private final AuctionJpaRepository auctions;
    ParticipantPersistenceAdapter(ParticipantJpaRepository participants, AuctionJpaRepository auctions) { this.participants = participants; this.auctions = auctions; }
    public Participant save(Participant participant) {
        if (participant.id() != null) throw new IllegalArgumentException("참가자 기록은 생성 후 수정하지 않습니다.");
        ParticipantJpaEntity e = new ParticipantJpaEntity();
        e.auction = auctions.getReferenceById(Auction.DEFAULT_ID);
        e.customerName = participant.customerName().value();
        e.createdAt = participant.createdAt();
        return AuctionMapper.toDomain(participants.saveAndFlush(e));
    }
    public Optional<Participant> findByName(CustomerName name) { return participants.findByAuctionIdAndCustomerName(Auction.DEFAULT_ID, name.value()).map(AuctionMapper::toDomain); }
    public Optional<Participant> findById(long id) { return participants.findById(id).map(AuctionMapper::toDomain); }
    public List<Participant> findAll() { return participants.findAllByAuctionIdOrderByCreatedAtAscIdAsc(Auction.DEFAULT_ID).stream().map(AuctionMapper::toDomain).toList(); }
}
