package com.example.demo.usecase;

public interface SubscribeAuctionEventsUseCase {
    /** 취소 콜백을 반환한다. 각 연결 종료 시 호출해야 한다. */
    Runnable subscribe(Runnable onChange);
}
