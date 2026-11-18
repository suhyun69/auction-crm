package com.example.demo.auction.adapter.out.persistence;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
interface ParticipantJpaRepository extends JpaRepository<ParticipantJpaEntity, Long> {
    Optional<ParticipantJpaEntity> findByAuctionIdAndCustomerName(long auctionId, String name);
    List<ParticipantJpaEntity> findAllByAuctionIdOrderByCreatedAtAscIdAsc(long auctionId);
}
