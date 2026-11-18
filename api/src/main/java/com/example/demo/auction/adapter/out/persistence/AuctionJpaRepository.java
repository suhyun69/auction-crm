package com.example.demo.auction.adapter.out.persistence;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
interface AuctionJpaRepository extends JpaRepository<AuctionJpaEntity, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select a from AuctionJpaEntity a where a.id = 1")
    Optional<AuctionJpaEntity> findForUpdate();
}
