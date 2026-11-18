package com.example.demo.auction.adapter.out.persistence;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
interface BidJpaRepository extends JpaRepository<BidJpaEntity, Long> {
    Optional<BidJpaEntity> findByIdempotencyKey(String key);
    List<BidJpaEntity> findAllByOrderByIdAsc();
}
