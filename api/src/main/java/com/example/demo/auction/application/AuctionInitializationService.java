package com.example.demo.auction.application;

import com.example.demo.auction.application.port.out.AuctionRepositoryPort;
import com.example.demo.auction.domain.Auction;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class AuctionInitializationService {
    private final AuctionRepositoryPort auctions;
    public AuctionInitializationService(AuctionRepositoryPort auctions) { this.auctions = auctions; }
    public void initialize() {
        if (auctions.find().isEmpty()) auctions.save(Auction.create());
    }
}
