package com.example.demo.auction.adapter.out.persistence;

import com.example.demo.auction.application.port.out.*;
import com.example.demo.auction.domain.*;
import com.example.demo.usecase.InitializeAuctionUseCase;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Instant;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:auction-persistence-test;DB_CLOSE_DELAY=-1")
class AuctionPersistenceTest {
    @Autowired AuctionRepositoryPort auctions;
    @Autowired ParticipantRepositoryPort participants;
    @Autowired BidRepositoryPort bids;
    @Autowired InitializeAuctionUseCase initializer;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    @Autowired jakarta.persistence.EntityManager entityManager;
    private final Instant now = Instant.parse("2026-11-18T00:00:00Z");
    private TransactionTemplate tx() { return new TransactionTemplate(manager); }
    @BeforeEach
    void resetAuctionData() {
        tx().executeWithoutResult(status -> {
            auctions.save(Auction.create());
            jdbc.update("delete from auction_bid");
            jdbc.update("delete from auction_participant");
        });
    }
    @Test
    void initializationIsRepeatableAndDoesNotResetHighestBid() {
        tx().executeWithoutResult(status -> {
            Auction a = auctions.findForUpdate();
            Participant p = participants.save(Participant.create(new CustomerName("초기화"), now));
            Bid saved = bids.save(Bid.create(p.id(), a.bid(p.customerName(), new BidAmount(800)), now));
            a.linkHighestBid(saved.id());
            auctions.save(a);
        });
        initializer.initialize(); initializer.initialize();
        tx().executeWithoutResult(status -> {
            Auction a = auctions.findForUpdate();
            assertThat(a.getId()).isEqualTo(1L);
            assertThat(a.getHighestAmount().value()).isEqualTo(800);
            assertThat(a.getHighestBidId()).isNotNull();
        });
    }
    @Test
    void mappingRoundTripKeepsDecisionSnapshotAndNullableKeys() {
        tx().executeWithoutResult(status -> {
            Auction a = Auction.create();
            Participant p = participants.save(Participant.create(new CustomerName(" 매핑 고객 "), now));
            Bid first = bids.save(new Bid(null, p.id(), a.bid(p.customerName(), new BidAmount(100)), now, "mapping-key"));
            Bid second = bids.save(Bid.create(p.id(), a.bid(p.customerName(), new BidAmount(200)), now));
            Bid third = bids.save(Bid.create(p.id(), a.bid(p.customerName(), new BidAmount(150)), now));
            entityManager.clear();
            assertThat(participants.findByName(new CustomerName("매핑 고객"))).contains(p);
            assertThat(participants.findById(p.id())).contains(p);
            assertThat(bids.findByIdempotencyKey("mapping-key")).contains(first);
            assertThat(bids.findById(first.id())).contains(first);
            assertThat(first.decision().highestAmount().value()).isEqualTo(100);
            assertThat(second.idempotencyKey()).isNull();
            assertThat(third.decision().status()).isEqualTo(BidStatus.REJECTED);
            assertThat(bids.findAll()).contains(first, second, third);
            assertThat(participants.findAll()).contains(p);
            status.setRollbackOnly();
        });
    }
    @Test
    void normalizedParticipantNamesAreUniqueWithinAuction() {
        assertThatThrownBy(() -> tx().executeWithoutResult(status -> {
            participants.save(Participant.create(new CustomerName(" 중복 "), now));
            participants.save(Participant.create(new CustomerName("중복"), now));
        })).isInstanceOf(DataIntegrityViolationException.class);
    }
    @Test
    void idempotencyKeysAreUniqueAcrossBids() {
        assertThatThrownBy(() -> tx().executeWithoutResult(status -> {
            Participant p = participants.save(Participant.create(new CustomerName("키 중복"), now));
            BidDecision decision = Auction.create().bid(p.customerName(), new BidAmount(100));
            bids.save(new Bid(null, p.id(), decision, now, "duplicate-key"));
            bids.save(new Bid(null, p.id(), decision, now, "duplicate-key"));
        })).isInstanceOf(DataIntegrityViolationException.class);
    }
    @Test
    void pessimisticLockSerializesSeparateTransactions() throws Exception {
        CountDownLatch firstHasLock = new CountDownLatch(1), releaseFirst = new CountDownLatch(1), secondAttempted = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = pool.submit(() -> tx().executeWithoutResult(status -> {
                Auction a = auctions.findForUpdate(); firstHasLock.countDown(); await(releaseFirst);
                a.bid(new CustomerName("잠금 고객"), new BidAmount(999)); auctions.save(a);
            }));
            assertThat(firstHasLock.await(3, TimeUnit.SECONDS)).isTrue();
            Future<Long> second = pool.submit(() -> tx().execute(status -> {
                secondAttempted.countDown(); return auctions.findForUpdate().getHighestAmount().value();
            }));
            assertThat(secondAttempted.await(3, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> second.get(150, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            releaseFirst.countDown(); first.get(3, TimeUnit.SECONDS);
            assertThat(second.get(3, TimeUnit.SECONDS)).isEqualTo(999L);
        } finally { releaseFirst.countDown(); pool.shutdownNow(); }
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(5, TimeUnit.SECONDS)) throw new AssertionError("잠금 테스트 타임아웃"); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
    }
}
