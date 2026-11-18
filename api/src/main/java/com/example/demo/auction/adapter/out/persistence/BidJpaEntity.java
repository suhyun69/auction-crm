package com.example.demo.auction.adapter.out.persistence;
import jakarta.persistence.*;
import java.time.Instant;
import com.example.demo.auction.domain.BidStatus;
import com.example.demo.auction.domain.BidReason;
@Entity
@Table(name = "auction_bid", uniqueConstraints = @UniqueConstraint(name = "uk_bid_idempotency_key", columnNames = "idempotency_key"), indexes = {@Index(name = "ix_bid_participant_status", columnList = "participant_id,status,amount"), @Index(name = "ix_bid_created", columnList = "created_at,id")})
public class BidJpaEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "participant_id", nullable = false, updatable = false) ParticipantJpaEntity participant;
    @Column(nullable = false, updatable = false) long amount;
    @Enumerated(EnumType.STRING) @Column(nullable = false, updatable = false, length = 20) BidStatus status;
    @Enumerated(EnumType.STRING) @Column(nullable = false, updatable = false, length = 40) BidReason reason;
    @Column(name = "highest_amount", nullable = false, updatable = false) long highestAmount;
    @Column(name = "highest_bidder_name", nullable = false, updatable = false, length = 100) String highestBidderName;
    @Column(name = "created_at", nullable = false, updatable = false) Instant createdAt;
    @Column(name = "idempotency_key", length = 200, updatable = false) String idempotencyKey;
    protected BidJpaEntity() {}
    public Long getId() { return id; }
    public ParticipantJpaEntity getParticipant() { return participant; }
    public long getAmount() { return amount; }
    public BidStatus getStatus() { return status; }
    public BidReason getReason() { return reason; }
    public long getHighestAmount() { return highestAmount; }
    public String getHighestBidderName() { return highestBidderName; }
    public Instant getCreatedAt() { return createdAt; }
    public String getIdempotencyKey() { return idempotencyKey; }
}
