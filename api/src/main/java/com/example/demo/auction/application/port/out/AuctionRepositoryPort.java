package com.example.demo.auction.application.port.out;
import com.example.demo.auction.domain.*;
import java.util.*;
public interface AuctionRepositoryPort {
    Optional<Auction> find(); Auction findForUpdate(); Auction save(Auction auction);
}
