package com.example.demo.auction.adapter.out.persistence;

import com.example.demo.auction.application.port.out.DashboardRepositoryPort;
import com.example.demo.auction.domain.ParticipantStanding;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.List;

@Component
public class DashboardPersistenceAdapter implements DashboardRepositoryPort {
    private final ParticipantJpaRepository participants;
    DashboardPersistenceAdapter(ParticipantJpaRepository participants) { this.participants = participants; }
    public List<ParticipantStanding> readStandings() {
        // DTO scalar projection이므로 지연 로딩 또는 후속 SQL이 발생하지 않는다.
        return participants.readStandings().stream().map(row -> new ParticipantStanding(
                (Long) row[0], (String) row[1], (Instant) row[2], (Long) row[4], (Long) row[3], (Instant) row[5])).toList();
    }
}
