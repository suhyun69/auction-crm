package com.example.demo.controller.stream;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.io.IOException;
import java.util.concurrent.ScheduledFuture;
import java.util.function.Supplier;

/** HTTP 연결 단위 자원. 종료·heartbeat·발행의 경쟁을 동일 모니터로 정리한다. */
public final class AuctionSseConnection {
    private final SseEmitter emitter;
    private boolean closed;
    private Runnable unsubscribe;
    private ScheduledFuture<?> heartbeat;

    public AuctionSseConnection(long timeout) {
        emitter = new SseEmitter(timeout);
        emitter.onCompletion(this::close);
        emitter.onTimeout(this::close);
        emitter.onError(error -> close());
    }
    public SseEmitter emitter() { return emitter; }
    public synchronized void start(Supplier<Runnable> subscribe, Supplier<ScheduledFuture<?>> scheduleHeartbeat) {
        send("ready");
        if (closed) return;
        unsubscribe = subscribe.get();
        heartbeat = scheduleHeartbeat.get();
    }
    public synchronized void send(String event) {
        if (closed) return;
        try { emitter.send(SseEmitter.event().name(event).data("{}")); }
        catch (IOException | IllegalStateException e) { close(); }
    }
    public synchronized void heartbeat() {
        if (closed) return;
        try { emitter.send(SseEmitter.event().comment("heartbeat")); }
        catch (IOException | IllegalStateException e) { close(); }
    }
    public synchronized void close() {
        if (closed) return;
        closed = true;
        if (unsubscribe != null) unsubscribe.run();
        if (heartbeat != null) heartbeat.cancel(false);
        emitter.complete();
    }
}
