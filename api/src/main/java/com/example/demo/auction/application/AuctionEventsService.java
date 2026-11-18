package com.example.demo.auction.application;

import com.example.demo.auction.application.port.out.AuctionEventsPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class AuctionEventsService {
    private final AuctionEventsPort events;
    public AuctionEventsService(AuctionEventsPort events) { this.events = events; }
    public Runnable subscribe(Runnable onChange) { return events.subscribe(onChange); }
}
