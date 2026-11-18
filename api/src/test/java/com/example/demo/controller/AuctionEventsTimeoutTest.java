package com.example.demo.controller;

import com.example.demo.auction.adapter.out.events.AuctionEventsAdapter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:events-timeout-test;DB_CLOSE_DELAY=-1",
    "auction.events.heartbeat-ms=50", "auction.events.timeout-ms=150"})
class AuctionEventsTimeoutTest {
    @LocalServerPort int port;
    @Autowired AuctionEventsAdapter events;

    @Test
    void servletTimeoutRemovesSubscriberAndStopsHeartbeat() throws Exception {
        var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(
                URI.create("http://localhost:" + port + "/api/events")).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
        assertThat(response.statusCode()).isEqualTo(200);
        try (var body = response.body()) {
            var reader = new java.io.BufferedReader(new java.io.InputStreamReader(body));
            assertThat(reader.readLine()).isEqualTo("event:ready");
            await().atMost(Duration.ofSeconds(4)).until(() -> events.subscriberCount() == 0);
        }
    }
}
