package com.example.demo.usecase.dto;

import com.example.demo.auction.domain.DashboardSnapshot;
import java.util.List;
import java.util.stream.IntStream;

public record DashboardAppResponse(long bidCount, long participantCount, long highestAmount,
        String highestBidderName, List<DashboardParticipantAppResponse> participants) {
    public static DashboardAppResponse from(DashboardSnapshot snapshot) {
        var rows = IntStream.range(0, snapshot.participants().size()).mapToObj(index -> {
            var row = snapshot.participants().get(index);
            return new DashboardParticipantAppResponse(row.participantId(), row.customerName(), index + 1,
                    row.highestAcceptedAmount(), row.bidCount(), row.lastBidAt());
        }).toList();
        return new DashboardAppResponse(snapshot.bidCount(), snapshot.participantCount(),
                snapshot.highestAmount(), snapshot.highestBidderName(), rows);
    }
}
