package com.example.demo.controller.dto;

import com.example.demo.usecase.dto.DashboardAppResponse;
import java.util.List;
public record DashboardWebResponse(DashboardSummaryWebResponse summary,
                                   List<DashboardParticipantWebResponse> participants) {
    public static DashboardWebResponse from(DashboardAppResponse result) {
        return new DashboardWebResponse(new DashboardSummaryWebResponse(result.bidCount(), result.participantCount(),
                result.highestAmount(), result.highestBidderName()), result.participants().stream()
                .map(p -> new DashboardParticipantWebResponse(p.participantId(), p.customerName(), p.rank(),
                        p.highestAcceptedAmount(), p.bidCount(), p.lastBidAt())).toList());
    }
}
