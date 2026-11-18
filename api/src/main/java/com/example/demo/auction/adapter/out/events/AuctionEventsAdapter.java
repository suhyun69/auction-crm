package com.example.demo.auction.adapter.out.events;

import com.example.demo.auction.application.port.out.AuctionEventsPort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AuctionEventsAdapter implements AuctionEventsPort {
    private final Set<Runnable> subscribers = ConcurrentHashMap.newKeySet();
    public Runnable subscribe(Runnable onChange) {
        subscribers.add(onChange);
        return () -> subscribers.remove(onChange);
    }
    public void publishAfterCommit() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("이벤트는 응찰 트랜잭션 안에서 예약해야 합니다.");
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                for (Runnable subscriber : subscribers) {
                    try { subscriber.run(); }
                    catch (RuntimeException e) { subscribers.remove(subscriber); }
                }
            }
        });
    }
    public int subscriberCount() { return subscribers.size(); }
}
