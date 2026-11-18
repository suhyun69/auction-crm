package com.example.demo.usecase.impl;

import com.example.demo.auction.application.AuctionInitializationService;
import com.example.demo.usecase.InitializeAuctionUseCase;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class InitializeAuctionUseCaseImpl implements InitializeAuctionUseCase {
    private final AuctionInitializationService service;
    public InitializeAuctionUseCaseImpl(AuctionInitializationService service) { this.service = service; }
    public void initialize() { service.initialize(); }
}
