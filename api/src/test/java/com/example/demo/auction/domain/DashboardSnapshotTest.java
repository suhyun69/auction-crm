package com.example.demo.auction.domain;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class DashboardSnapshotTest {
    @Test
    void equalAmountsUseCreationTimeThenIdAndNullsComeLast() {
        Instant first = Instant.parse("2026-11-18T00:00:00Z"), later = first.plusSeconds(1);
        var snapshot = DashboardSnapshot.from(List.of(
            new ParticipantStanding(5, "null-later", later, null, 1, later),
            new ParticipantStanding(4, "accepted-later", later, 100L, 1, later),
            new ParticipantStanding(3, "accepted-id3", first, 100L, 1, first),
            new ParticipantStanding(2, "null-first", first, null, 1, first),
            new ParticipantStanding(1, "accepted-id1", first, 100L, 1, first)));
        assertThat(snapshot.participants()).extracting(ParticipantStanding::participantId).containsExactly(1L, 3L, 4L, 2L, 5L);
    }
}
