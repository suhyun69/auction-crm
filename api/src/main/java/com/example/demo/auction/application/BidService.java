package com.example.demo.auction.application;

import com.example.demo.auction.application.port.out.*;
import com.example.demo.auction.domain.*;
import com.example.demo.common.exception.InvalidInputException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Instant;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class BidService {
    private final AuctionRepositoryPort auctions;
    private final ParticipantRepositoryPort participants;
    private final BidRepositoryPort bids;
    private final Clock clock;

    public BidService(AuctionRepositoryPort auctions, ParticipantRepositoryPort participants,
                      BidRepositoryPort bids, Clock clock) {
        this.auctions = auctions;
        this.participants = participants;
        this.bids = bids;
        this.clock = clock;
    }

    public Bid submit(String rawName, long rawAmount, String key) {
        CustomerName name = new CustomerName(rawName);
        BidAmount amount = new BidAmount(rawAmount);
        if (key != null && (key.isBlank() || key.length() > 200)) {
            throw new InvalidInputException("Idempotency-Key는 1~200자여야 합니다.");
        }
        // 첫 요청부터 같은 행으로 직렬화한다. 참가자 생성과 키 조회도 잠금 안에 포함한다.
        Auction auction = auctions.findForUpdate();
        if (key != null) {
            var previous = bids.findByIdempotencyKey(key);
            if (previous.isPresent()) {
                Bid bid = previous.get();
                Participant original = participants.findById(bid.participantId()).orElseThrow();
                if (!original.customerName().equals(name)
                        || bid.decision().submittedAmount().value() != amount.value()) {
                    throw new IdempotencyConflictException();
                }
                return bid;
            }
        }
        Instant now = Instant.now(clock);
        Participant participant = participants.findByName(name)
                .orElseGet(() -> participants.save(Participant.create(name, now)));
        BidDecision decision = auction.bid(name, amount);
        Bid saved = bids.save(new Bid(null, participant.id(), decision, now, key));
        if (decision.status() == BidStatus.ACCEPTED) {
            auction.linkHighestBid(saved.id());
            auctions.save(auction);
        }
        return saved;
    }
}
