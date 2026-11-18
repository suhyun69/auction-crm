package com.example.demo.auction.application;

import com.example.demo.auction.application.port.out.DashboardRepositoryPort;
import com.example.demo.auction.domain.DashboardSnapshot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class DashboardService {
    private final DashboardRepositoryPort repository;
    public DashboardService(DashboardRepositoryPort repository) { this.repository = repository; }
    public DashboardSnapshot read() { return DashboardSnapshot.from(repository.readStandings()); }
}
