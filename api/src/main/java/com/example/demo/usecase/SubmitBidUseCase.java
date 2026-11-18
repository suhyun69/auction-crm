package com.example.demo.usecase;

import com.example.demo.usecase.dto.SubmitBidAppRequest;
import com.example.demo.usecase.dto.BidAppResponse;

public interface SubmitBidUseCase {
    BidAppResponse submit(SubmitBidAppRequest request);
}
