package com.example.demo.controller;

import com.example.demo.controller.dto.BidWebRequest;
import com.example.demo.controller.dto.BidWebResponse;
import com.example.demo.common.web.ErrorResponse;
import com.example.demo.usecase.SubmitBidUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@RestController
@Tag(name = "Auction", description = "경매 응찰 API")
public class BidController {
    private final SubmitBidUseCase submitBid;
    public BidController(SubmitBidUseCase submitBid) { this.submitBid = submitBid; }

    @PostMapping("/api/bid")
    @Operation(summary = "응찰 등록", description = "최고가를 초과하면 승인, 동일가·낮은 금액이면 기각. 모두 저장하며 200을 반환한다. 같은 키/정규화 이름/금액 재전송은 최초 응답을 반환한다.")
    @ApiResponse(responseCode = "200", description = "승인 또는 기각")
    @ApiResponse(responseCode = "400", description = "잘못된 이름·정수 금액·멱등 키", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "같은 멱등 키의 요청 내용 불일치", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public BidWebResponse submit(@RequestBody BidWebRequest request,
            @Parameter(description = "선택. 공백만인 키 제외 1~200자. 재시도 시 같은 값을 사용", example = "request-42")
            @RequestHeader(name = "Idempotency-Key", required = false) String key) {
        return BidWebResponse.from(submitBid.submit(request.toAppRequest(key)));
    }
}
