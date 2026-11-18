package com.example.demo.controller;

import com.example.demo.controller.stream.AuctionSseConnection;
import com.example.demo.usecase.SubscribeAuctionEventsUseCase;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.time.Duration;

@RestController
public class AuctionEventsController {
    private final SubscribeAuctionEventsUseCase subscribeEvents;
    private final TaskScheduler scheduler;
    private final long timeout;
    private final Duration heartbeat;
    public AuctionEventsController(SubscribeAuctionEventsUseCase subscribeEvents, TaskScheduler scheduler,
            @Value("${auction.events.timeout-ms:1800000}") long timeout,
            @Value("${auction.events.heartbeat-ms:15000}") long heartbeat) {
        if (timeout < 1 || heartbeat < 1) throw new IllegalArgumentException("SSE 주기는 양수여야 합니다.");
        this.subscribeEvents = subscribeEvents; this.scheduler = scheduler;
        this.timeout = timeout; this.heartbeat = Duration.ofMillis(heartbeat);
    }
    @GetMapping(value = "/api/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "경매 변경 SSE", description = "ready 후 새 응찰 커밋마다 dashboard-changed를 보낸다. heartbeat 주석으로 연결을 유지한다. 재연결 시 과거 이벤트를 재생하지 않으며 대시보드 전체 조회가 필요하다.")
    public ResponseEntity<SseEmitter> subscribe() {
        var connection = new AuctionSseConnection(timeout);
        connection.start(() -> subscribeEvents.subscribe(() -> connection.send("dashboard-changed")),
                () -> scheduler.scheduleAtFixedRate(connection::heartbeat, heartbeat));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("X-Accel-Buffering", "no").body(connection.emitter());
    }
}
