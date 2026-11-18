package com.example.demo.usecase.impl;

import com.example.demo.auction.application.AuctionEventsService;
import com.example.demo.usecase.SubscribeAuctionEventsUseCase;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SubscribeAuctionEventsUseCaseImpl implements SubscribeAuctionEventsUseCase {
    private final AuctionEventsService service;
    public SubscribeAuctionEventsUseCaseImpl(AuctionEventsService service) { this.service = service; }
    public Runnable subscribe(Runnable onChange) { return service.subscribe(onChange); }
}
