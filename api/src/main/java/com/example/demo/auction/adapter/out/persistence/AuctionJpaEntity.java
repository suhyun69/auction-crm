package com.example.demo.auction.adapter.out.persistence;
import jakarta.persistence.*;
import java.time.Instant;
import com.example.demo.auction.domain.BidStatus;
import com.example.demo.auction.domain.BidReason;
@Entity
@Table(name = "auction")
public class AuctionJpaEntity {
    @Id long id;
    @Column(name = "highest_amount") Long highestAmount;
    @Column(name = "highest_bidder_name", length = 100) String highestBidderName;
    @OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "highest_bid_id") BidJpaEntity highestBid;
    protected AuctionJpaEntity() {}
    public long getId() { return id; }
    public Long getHighestAmount() { return highestAmount; }
    public String getHighestBidderName() { return highestBidderName; }
    public BidJpaEntity getHighestBid() { return highestBid; }
}
