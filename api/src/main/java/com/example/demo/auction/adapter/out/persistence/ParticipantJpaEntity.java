package com.example.demo.auction.adapter.out.persistence;
import jakarta.persistence.*;
import java.time.Instant;
import com.example.demo.auction.domain.BidStatus;
import com.example.demo.auction.domain.BidReason;
@Entity
@Table(name = "auction_participant", uniqueConstraints = @UniqueConstraint(name = "uk_participant_auction_name", columnNames = {"auction_id", "customer_name"}), indexes = @Index(name = "ix_participant_created", columnList = "created_at,id"))
public class ParticipantJpaEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "auction_id", nullable = false, updatable = false) AuctionJpaEntity auction;
    @Column(name = "customer_name", nullable = false, length = 100, updatable = false) String customerName;
    @Column(name = "created_at", nullable = false, updatable = false) Instant createdAt;
    protected ParticipantJpaEntity() {}
    public Long getId() { return id; }
    public String getCustomerName() { return customerName; }
    public Instant getCreatedAt() { return createdAt; }
}
