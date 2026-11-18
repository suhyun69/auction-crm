package com.example.demo.controller;

import com.example.demo.controller.dto.DashboardWebResponse;
import com.example.demo.usecase.ReadDashboardUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Auction")
public class DashboardController {
    private final ReadDashboardUseCase readDashboard;
    public DashboardController(ReadDashboardUseCase readDashboard) { this.readDashboard = readDashboard; }
    @GetMapping("/api/dashboard")
    @Operation(summary = "경매 대시보드", description = "동일 SQL 스냅샷의 요약과 개인 승인 최고가 내림차순 전체 순위. 승인 이력이 없는 참가자는 하단에 표시한다.")
    public ResponseEntity<DashboardWebResponse> read() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(DashboardWebResponse.from(readDashboard.read()));
    }
}
