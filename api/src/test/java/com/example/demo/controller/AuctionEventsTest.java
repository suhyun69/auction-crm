package com.example.demo.controller;

import com.example.demo.auction.adapter.out.events.AuctionEventsAdapter;
import com.example.demo.auction.adapter.out.persistence.AuctionPersistenceAdapter;
import com.example.demo.auction.domain.Auction;
import com.example.demo.usecase.*;
import com.example.demo.usecase.dto.SubmitBidAppRequest;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:events-test;DB_CLOSE_DELAY=-1",
    "auction.events.heartbeat-ms=50", "auction.events.timeout-ms=15000"})
class AuctionEventsTest {
    @LocalServerPort int port;
    @Autowired SubmitBidUseCase submit;
    @Autowired SubscribeAuctionEventsUseCase subscribe;
    @Autowired AuctionEventsAdapter events;
    @Autowired AuctionPersistenceAdapter auctions;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    final List<Stream> streams = new ArrayList<>();
    final List<Runnable> cancellations = new ArrayList<>();
    final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void resetData() {
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            auctions.save(Auction.create());
            jdbc.update("delete from auction_bid"); jdbc.update("delete from auction_participant");
        });
    }
    @AfterEach
    void cleanup() throws Exception {
        for (Stream stream : streams) stream.close();
        cancellations.forEach(Runnable::run);
        await().atMost(Duration.ofSeconds(4)).until(() -> events.subscriberCount() == 0);
    }

    @Test
    void twoStreamsReceiveReadyHeartbeatAndCommittedChangeAndReconnect() throws Exception {
        Stream a = connect(), b = connect();
        assertThat(a.next()).isEqualTo("ready"); assertThat(b.next()).isEqualTo("ready");
        assertThat(a.await("heartbeat")).isEqualTo("heartbeat");
        bid("A", 100, null);
        assertThat(a.await("dashboard-changed")).isEqualTo("dashboard-changed");
        assertThat(b.await("dashboard-changed")).isEqualTo("dashboard-changed");
        a.close();
        await().atMost(Duration.ofSeconds(4)).until(() -> events.subscriberCount() == 1);
        Stream reconnected = connect();
        assertThat(reconnected.next()).isEqualTo("ready");
        bid("B", 200, null);
        assertThat(reconnected.await("dashboard-changed")).isEqualTo("dashboard-changed");
    }

    @Test
    void eventsWaitForCommitAndAreAbsentForRollbackAndIdempotentReplay() {
        AtomicInteger count = new AtomicInteger();
        cancellations.add(subscribe.subscribe(count::incrementAndGet));
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            bid("A", 100, "first");
            assertThat(count.get()).isZero();
        });
        assertThat(count.get()).isEqualTo(1);
        bid("A", 100, "first");
        assertThat(count.get()).isEqualTo(1);
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            bid("B", 200, null);
            assertThat(count.get()).isEqualTo(1);
            status.setRollbackOnly();
        });
        assertThat(count.get()).isEqualTo(1);
        bid("C", 50, null); // 기각도 새 기록이므로 변경 알림을 보낸다.
        assertThat(count.get()).isEqualTo(2);
    }

    @Test
    void brokenSubscriberDoesNotFailCommittedBidOrOtherSubscribers() {
        cancellations.add(subscribe.subscribe(() -> { throw new IllegalStateException("broken"); }));
        AtomicInteger count = new AtomicInteger();
        cancellations.add(subscribe.subscribe(count::incrementAndGet));
        assertThatCode(() -> bid("A", 100, null)).doesNotThrowAnyException();
        assertThat(count.get()).isEqualTo(1);
        assertThat(events.subscriberCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from auction_bid", Long.class)).isEqualTo(1);
    }

    @Test
    void allowedOriginHeadersAndRejectedOriginPreflightAreScoped() throws Exception {
        for (String path : List.of("/api/bid", "/api/dashboard", "/api/events")) {
            var allowed = client.send(HttpRequest.newBuilder(uri(path)).method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .header("Origin", "http://localhost:3000").header("Access-Control-Request-Method", path.endsWith("bid") ? "POST" : "GET").build(), HttpResponse.BodyHandlers.ofString());
            assertThat(allowed.statusCode()).isEqualTo(200);
            assertThat(allowed.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:3000");
        }
        var rejected = client.send(HttpRequest.newBuilder(uri("/api/events")).method("OPTIONS", HttpRequest.BodyPublishers.noBody())
            .header("Origin", "https://untrusted.example").header("Access-Control-Request-Method", "GET").build(), HttpResponse.BodyHandlers.ofString());
        assertThat(rejected.statusCode()).isEqualTo(403);
        assertThat(rejected.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
    }

    private URI uri(String path) { return URI.create("http://localhost:" + port + path); }
    private Stream connect() throws Exception {
        var response = client.send(HttpRequest.newBuilder(uri("/api/events")).GET().header("Accept", "text/event-stream").build(), HttpResponse.BodyHandlers.ofInputStream());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        Stream stream = new Stream(response.body()); streams.add(stream); return stream;
    }
    private void bid(String name, long amount, String key) { submit.submit(new SubmitBidAppRequest(name, amount, key)); }

    static final class Stream implements AutoCloseable {
        private final InputStream body;
        private final BlockingQueue<String> frames = new LinkedBlockingQueue<>();
        Stream(InputStream body) {
            this.body = body;
            Thread.startVirtualThread(() -> {
                try (var reader = new BufferedReader(new InputStreamReader(body, java.nio.charset.StandardCharsets.UTF_8))) {
                    String event = null;
                    for (String line; (line = reader.readLine()) != null;) {
                        if (line.startsWith("event:")) event = line.substring(6).strip();
                        if (line.startsWith(":heartbeat")) event = "heartbeat";
                        if (line.isEmpty() && event != null) { frames.add(event); event = null; }
                    }
                } catch (IOException ignored) { }
            });
        }
        String next() throws InterruptedException { return frames.poll(3, TimeUnit.SECONDS); }
        String await(String expected) throws InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            while (System.nanoTime() < deadline) {
                String value = frames.poll(100, TimeUnit.MILLISECONDS);
                if (expected.equals(value)) return value;
            }
            throw new AssertionError("SSE event missing: " + expected);
        }
        public void close() throws IOException { body.close(); }
    }
}
