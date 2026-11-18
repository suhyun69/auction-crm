package com.example.demo.auction.application.port.out;

/** 콜백 등록과 취소는 JDK 타입만 사용한다. 전달 내용은 변경 재조회 신호다. */
public interface AuctionEventsPort {
    Runnable subscribe(Runnable onChange);
    void publishAfterCommit();
}
