package com.example.demo.auction.domain;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.assertj.core.api.Assertions.*;

class AuctionTest {
    private final CustomerName alice = new CustomerName("Alice");
    private final CustomerName bob = new CustomerName("Bob");

    @Test
    void firstBidAndHigherBidAreAccepted() {
        Auction auction = Auction.create();
        assertThat(auction.getHighestAmount()).isNull();
        assertThat(auction.getHighestBidderName()).isNull();
        BidDecision first = auction.bid(alice, new BidAmount(1));
        BidDecision next = auction.bid(bob, new BidAmount(200));
        assertThat(first.status()).isEqualTo(BidStatus.ACCEPTED);
        assertThat(first.reason()).isEqualTo(BidReason.NEW_HIGHEST_BID);
        assertThat(next.status()).isEqualTo(BidStatus.ACCEPTED);
        assertThat(auction.getHighestAmount().value()).isEqualTo(200);
        assertThat(auction.getHighestBidderName()).isEqualTo(bob);
        assertThat(first.highestAmount().value()).isEqualTo(1);
        assertThat(first.highestBidderName()).isEqualTo(alice);
    }

    @Test
    void equalAndLowerBidAreRejectedWithoutChangingHighestBidder() {
        Auction auction = Auction.create();
        auction.bid(alice, new BidAmount(200));
        for (long amount : new long[]{200, 199}) {
            BidDecision result = auction.bid(bob, new BidAmount(amount));
            assertThat(result.status()).isEqualTo(BidStatus.REJECTED);
            assertThat(result.reason()).isEqualTo(BidReason.AMOUNT_NOT_HIGH_ENOUGH);
            assertThat(result.submittedAmount().value()).isEqualTo(amount);
            assertThat(result.highestAmount().value()).isEqualTo(200);
            assertThat(result.highestBidderName()).isEqualTo(alice);
        }
        assertThat(auction.getHighestAmount().value()).isEqualTo(200);
        assertThat(auction.getHighestBidderName()).isEqualTo(alice);
    }

    @Test
    void sameParticipantCanRaiseHighestBid() {
        Auction auction = Auction.create();
        auction.bid(alice, new BidAmount(200));
        assertThat(auction.bid(new CustomerName(" Alice "), new BidAmount(300)).status())
                .isEqualTo(BidStatus.ACCEPTED);
        assertThat(auction.getHighestBidderName()).isEqualTo(alice);
    }

    @Test
    void restoredAuctionAppliesSameRules() {
        Auction auction = Auction.reconstitute(1L, new BidAmount(100), alice);
        assertThat(auction.bid(bob, new BidAmount(100)).status()).isEqualTo(BidStatus.REJECTED);
        assertThat(auction.bid(bob, new BidAmount(BidAmount.MAX_VALUE)).status()).isEqualTo(BidStatus.ACCEPTED);
        assertThatThrownBy(() -> Auction.reconstitute(1L, new BidAmount(100), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void recordsKeepBothAcceptedAndRejectedDecisions() {
        Instant now = Instant.parse("2026-11-18T00:00:00Z");
        Participant participant = Participant.create(alice, now);
        assertThat(participant.id()).isNull();
        assertThat(participant.customerName()).isEqualTo(alice);
        Auction auction = Auction.create();
        Bid accepted = Bid.create(1L, auction.bid(alice, new BidAmount(100)), now);
        Bid rejected = Bid.create(2L, auction.bid(bob, new BidAmount(50)), now);
        assertThat(accepted.id()).isNull();
        assertThat(accepted.decision().status()).isEqualTo(BidStatus.ACCEPTED);
        assertThat(rejected.decision().status()).isEqualTo(BidStatus.REJECTED);
        assertThat(rejected.createdAt()).isEqualTo(now);
    }

    @Test
    void decisionRejectsInconsistentStatusAndSnapshot() {
        assertThatThrownBy(() -> new BidDecision(BidStatus.ACCEPTED,
                BidReason.AMOUNT_NOT_HIGH_ENOUGH, new BidAmount(100), new BidAmount(100), alice))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BidDecision(BidStatus.REJECTED,
                BidReason.AMOUNT_NOT_HIGH_ENOUGH, new BidAmount(200), new BidAmount(100), alice))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
