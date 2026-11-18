package com.example.demo.controller;

import com.example.demo.auction.adapter.out.persistence.AuctionPersistenceAdapter;
import com.example.demo.auction.domain.Auction;
import com.example.demo.usecase.*;
import com.example.demo.usecase.dto.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import jakarta.persistence.EntityManagerFactory;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:dashboard-test;DB_CLOSE_DELAY=-1", "spring.jpa.properties.hibernate.generate_statistics=true"})
@AutoConfigureMockMvc
class DashboardControllerTest {
    @Autowired MockMvc mvc;
    @Autowired SubmitBidUseCase submit;
    @Autowired ReadDashboardUseCase dashboard;
    @Autowired AuctionPersistenceAdapter auctions;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory emf;

    @BeforeEach
    void resetData() {
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            auctions.save(Auction.create());
            jdbc.update("delete from auction_bid"); jdbc.update("delete from auction_participant");
        });
    }

    @Test
    void emptyDashboardHasExplicitNullAndZeroValues() throws Exception {
        mvc.perform(get("/api/dashboard")).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("summary.bidCount").value(0))
            .andExpect(jsonPath("summary.participantCount").value(0))
            .andExpect(jsonPath("summary.highestAmount").value(0))
            .andExpect(jsonPath("summary.highestBidderName").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("participants").isEmpty());
    }

    @Test
    void countsAndOrderKeepHighestAcceptedBidAndRejectedOnlyParticipants() throws Exception {
        bid("A", 100, "first"); bid("B", 200, null); bid("C", 150, null);
        bid("A", 300, null); bid("A", 10, null); bid("D", 100, null);
        bid("A", 100, "first");
        var result = dashboard.read();
        assertThat(result.bidCount()).isEqualTo(6);
        assertThat(result.participantCount()).isEqualTo(4);
        assertThat(result.highestAmount()).isEqualTo(300);
        assertThat(result.highestBidderName()).isEqualTo("A");
        assertThat(result.participants()).extracting(DashboardParticipantAppResponse::customerName).containsExactly("A", "B", "C", "D");
        assertThat(result.participants()).extracting(DashboardParticipantAppResponse::rank).containsExactly(1,2,3,4);
        assertThat(result.participants().getFirst().highestAcceptedAmount()).isEqualTo(300);
        assertThat(result.participants().getFirst().bidCount()).isEqualTo(3);
        assertThat(result.participants().get(2).highestAcceptedAmount()).isNull();
        mvc.perform(get("/api/dashboard")).andExpect(status().isOk())
            .andExpect(jsonPath("participants[0].lastBidAt").value(org.hamcrest.Matchers.endsWith("Z")))
            .andExpect(jsonPath("participants[2].highestAcceptedAmount").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void dashboardUsesExactlyOneSqlSnapshot() {
        bid("A", 100, null); bid("B", 200, null);
        var stats = emf.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        stats.clear();
        dashboard.read();
        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void readsRemainConsistentWhileWritesCommit() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<?> writer = pool.submit(() -> {
                await(start);
                for (int i = 1; i <= 40; i++) bid("customer-" + i, i, null);
            });
            Future<?> reader = pool.submit(() -> {
                await(start);
                for (int i = 0; i < 80; i++) {
                    var result = dashboard.read();
                    assertThat(result.bidCount()).isEqualTo(result.participantCount());
                    assertThat(result.participants()).hasSize((int) result.participantCount());
                    assertThat(result.highestAmount()).isEqualTo(result.bidCount());
                    assertThat(result.participants().stream().mapToLong(DashboardParticipantAppResponse::bidCount).sum()).isEqualTo(result.bidCount());
                    if (!result.participants().isEmpty()) {
                        assertThat(result.participants().getFirst().highestAcceptedAmount()).isEqualTo(result.highestAmount());
                        assertThat(result.participants().getFirst().customerName()).isEqualTo(result.highestBidderName());
                    }
                }
            });
            start.countDown(); writer.get(15, TimeUnit.SECONDS); reader.get(15, TimeUnit.SECONDS);
            assertThat(dashboard.read().bidCount()).isEqualTo(40);
        } finally { pool.shutdownNow(); }
    }

    private void bid(String name, long amount, String key) { submit.submit(new SubmitBidAppRequest(name, amount, key)); }
    private static void await(CountDownLatch latch) {
        try { latch.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
    }
}
