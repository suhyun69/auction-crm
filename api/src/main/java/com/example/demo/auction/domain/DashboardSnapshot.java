package com.example.demo.auction.domain;

import java.util.Comparator;
import java.util.List;

public record DashboardSnapshot(long bidCount, long participantCount, long highestAmount,
                                String highestBidderName, List<ParticipantStanding> participants) {
    public DashboardSnapshot { participants = List.copyOf(participants); }

    public static DashboardSnapshot from(List<ParticipantStanding> standings) {
        var ordered = standings.stream().sorted(Comparator
                .comparing(ParticipantStanding::highestAcceptedAmount,
                        Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(ParticipantStanding::createdAt)
                .thenComparingLong(ParticipantStanding::participantId)).toList();
        var highest = ordered.stream().filter(p -> p.highestAcceptedAmount() != null).findFirst();
        return new DashboardSnapshot(ordered.stream().mapToLong(ParticipantStanding::bidCount).sum(),
                ordered.size(), highest.map(ParticipantStanding::highestAcceptedAmount).orElse(0L),
                highest.map(ParticipantStanding::customerName).orElse(null), ordered);
    }
}
