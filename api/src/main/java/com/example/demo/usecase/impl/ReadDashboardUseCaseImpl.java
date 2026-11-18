package com.example.demo.usecase.impl;

import com.example.demo.auction.application.DashboardService;
import com.example.demo.usecase.ReadDashboardUseCase;
import com.example.demo.usecase.dto.DashboardAppResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ReadDashboardUseCaseImpl implements ReadDashboardUseCase {
    private final DashboardService service;
    public ReadDashboardUseCaseImpl(DashboardService service) { this.service = service; }
    public DashboardAppResponse read() { return DashboardAppResponse.from(service.read()); }
}
