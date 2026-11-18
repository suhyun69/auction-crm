package com.example.demo.auction.application.port.out;
import com.example.demo.auction.domain.*;
import java.util.*;
public interface BidRepositoryPort {
    Bid save(Bid bid); Optional<Bid> findById(long id); Optional<Bid> findByIdempotencyKey(String key); List<Bid> findAll();
}
