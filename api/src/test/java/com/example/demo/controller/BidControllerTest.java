package com.example.demo.controller;

import com.example.demo.auction.adapter.out.persistence.AuctionPersistenceAdapter;
import com.example.demo.auction.application.port.out.*;
import com.example.demo.auction.domain.Auction;
import com.example.demo.usecase.SubmitBidUseCase;
import com.example.demo.usecase.dto.SubmitBidAppRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.IntFunction;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:bid-api-test;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class BidControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired SubmitBidUseCase submit;
    @Autowired BidRepositoryPort bids;
    @Autowired ParticipantRepositoryPort participants;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean AuctionPersistenceAdapter auctions;

    @BeforeEach
    void resetData() {
        reset(auctions);
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            auctions.save(Auction.create());
            jdbc.update("delete from auction_bid");
            jdbc.update("delete from auction_participant");
        });
    }

    @Test
    void acceptedEqualAndLowerRequestsAreAllRecorded() throws Exception {
        request("홍길동", "150000", null, 200, "ACCEPTED");
        request("김고객", "150000", null, 200, "REJECTED");
        request("김고객", "100000", null, 200, "REJECTED");
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from auction_participant", Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select highest_amount from auction", Long.class)).isEqualTo(150000);
    }

    @Test
    void idempotentRetryKeepsOriginalResponseAfterNewHighestBid() throws Exception {
        String first = request(" 홍길동 ", "100", "retry", 200, "ACCEPTED");
        request("다른고객", "200", null, 200, "ACCEPTED");
        String replay = request("홍길동", "100", "retry", 200, "ACCEPTED");
        assertThat(json.readTree(replay)).isEqualTo(json.readTree(first));
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isEqualTo(2);
        request("홍길동", "101", "retry", 409, null);
        request("다른고객", "100", "retry", 409, null);
    }

    @Test
    void rejectedRetryAlsoKeepsOriginalSnapshotAndDoesNotCountTwice() throws Exception {
        request("A", "200", null, 200, "ACCEPTED");
        String rejected = request("B", "100", "rejected", 200, "REJECTED");
        request("C", "300", null, 200, "ACCEPTED");
        String replay = request("B", "100", "rejected", 200, "REJECTED");
        assertThat(json.readTree(rejected)).isEqualTo(json.readTree(replay));
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isEqualTo(3);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "9007199254740992", "9223372036854775808", "1.0", "1.1", "1e2", "\"100\"", "true", "null", "{}", "[]"})
    void invalidAmountsAreRejectedWithoutWrites(String amount) throws Exception {
        request("A", amount, null, 400, null);
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from auction_participant", Long.class)).isZero();
    }

    @Test
    void invalidNamesKeysAndMalformedBodiesReturnExistingErrorShape() throws Exception {
        request(" ", "1", null, 400, null);
        request("가".repeat(101), "1", null, 400, null);
        request("A", "1", " ", 400, null);
        request("A", "1", "k".repeat(201), 400, null);
        for (String body : List.of("{", "{}", "null", "[]", "{\"customerName\":3,\"amount\":1}", "{\"customerName\":null,\"amount\":1}")) {
            mvc.perform(post("/api/bid").contentType("application/json").content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("status").value(400))
                .andExpect(jsonPath("message").exists()).andExpect(jsonPath("timestamp").exists());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {" garbage", " {}", " []", " true", " null", " 1"})
    void trailingTokensAreRejectedWithoutWrites(String suffix) throws Exception {
        mvc.perform(post("/api/bid").contentType("application/json")
                .content("{\"customerName\":\"A\",\"amount\":100}" + suffix))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("status").value(400));
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from auction_participant", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select highest_amount from auction", Long.class)).isNull();
    }

    @Test
    void validUpperBoundAndTrimmedNameAndKeyBoundaryAreAccepted() throws Exception {
        request(" ".repeat(200) + "가".repeat(100) + " ".repeat(200), "9007199254740991", "k".repeat(200), 200, "ACCEPTED");
    }

    @Test
    void concurrentFirstRequestsAndSameParticipantAreSerialized() throws Exception {
        var result = concurrent(8, i -> submit.submit(new SubmitBidAppRequest("동시 고객", 100 + i, "key-" + i)));
        assertThat(result).hasSize(8);
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isEqualTo(8);
        assertThat(jdbc.queryForObject("select count(*) from auction_participant", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select highest_amount from auction", Long.class)).isEqualTo(107);
        assertThat(jdbc.queryForObject("select b.amount from auction a join auction_bid b on a.highest_bid_id=b.id", Long.class)).isEqualTo(107);
    }

    @Test
    void concurrentSameKeyCreatesOnlyOneRecord() throws Exception {
        var result = concurrent(8, i -> submit.submit(new SubmitBidAppRequest("동일 고객", 100, "same-key")));
        assertThat(result).allMatch(result.getFirst()::equals);
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from auction_participant", Long.class)).isEqualTo(1);
    }

    @Test
    void concurrentDifferentRequestsWithSameKeyHaveOneWinnerAndOneConflict() throws Exception {
        var results = concurrent(2, i -> {
            try {
                submit.submit(new SubmitBidAppRequest("충돌 고객 " + i, 100 + i, "conflicting-key"));
                return "accepted";
            } catch (com.example.demo.auction.domain.IdempotencyConflictException e) {
                return "conflict";
            }
        });
        assertThat(results).containsExactlyInAnyOrder("accepted", "conflict");
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from auction_participant", Long.class)).isEqualTo(1);
    }

    @Test
    void failureAfterBidInsertRollsBackBidParticipantAndHighestAmount() throws Exception {
        doThrow(new IllegalStateException("injected persistence failure")).when(auctions).save(any());
        request("롤백", "100", "rollback-key", 500, null);
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from auction_participant", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select highest_amount from auction", Long.class)).isNull();
        reset(auctions);
        request("롤백", "100", "rollback-key", 200, "ACCEPTED");
    }

    private String request(String name, String amount, String key, int expected, String bidStatus) throws Exception {
        String body = "{\"customerName\":" + json.writeValueAsString(name) + ",\"amount\":" + amount + "}";
        var builder = post("/api/bid").contentType("application/json").content(body);
        if (key != null) builder.header("Idempotency-Key", key);
        var result = mvc.perform(builder).andExpect(status().is(expected));
        if (bidStatus != null) result.andExpect(jsonPath("status").value(bidStatus));
        return result.andReturn().getResponse().getContentAsString();
    }

    private static <T> List<T> concurrent(int count, IntFunction<T> action) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(count);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                int index = i;
                futures.add(pool.submit(() -> { start.await(); return action.apply(index); }));
            }
            start.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> f : futures) results.add(f.get(10, TimeUnit.SECONDS));
            return results;
        } finally { pool.shutdownNow(); }
    }
}
