package com.example.demo.usecase.impl;

import com.example.demo.auction.application.BidService;
import com.example.demo.usecase.SubmitBidUseCase;
import com.example.demo.usecase.dto.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SubmitBidUseCaseImpl implements SubmitBidUseCase {
    private final BidService service;
    public SubmitBidUseCaseImpl(BidService service) { this.service = service; }
    public BidAppResponse submit(SubmitBidAppRequest request) {
        return BidAppResponse.from(service.submit(request.customerName(), request.amount(), request.idempotencyKey()));
    }
}
