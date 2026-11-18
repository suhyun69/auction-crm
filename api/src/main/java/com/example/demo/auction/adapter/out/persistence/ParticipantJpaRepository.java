package com.example.demo.auction.adapter.out.persistence;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
interface ParticipantJpaRepository extends JpaRepository<ParticipantJpaEntity, Long> {
    Optional<ParticipantJpaEntity> findByAuctionIdAndCustomerName(long auctionId, String name);
    List<ParticipantJpaEntity> findAllByAuctionIdOrderByCreatedAtAscIdAsc(long auctionId);

    @org.springframework.data.jpa.repository.Query("""
        select p.id, p.customerName, p.createdAt, count(b.id),
               max(case when b.status = com.example.demo.auction.domain.BidStatus.ACCEPTED then b.amount else null end),
               max(b.createdAt)
        from ParticipantJpaEntity p left join BidJpaEntity b on b.participant = p
        where p.auction.id = 1
        group by p.id, p.customerName, p.createdAt
        """)
    List<Object[]> readStandings();
}
