package com.example.demo.auction.application.port.out;

import com.example.demo.auction.domain.ParticipantStanding;
import java.util.List;

public interface DashboardRepositoryPort {
    /** 전체 참가자와 집계가 하나의 SQL 스냅샷에서 반환되어야 한다. */
    List<ParticipantStanding> readStandings();
}
