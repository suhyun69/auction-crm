package com.example.demo.config;

import com.example.demo.usecase.InitializeAuctionUseCase;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AuctionInitializationConfig {
    @Bean
    ApplicationRunner initializeAuction(InitializeAuctionUseCase useCase) {
        return args -> useCase.initialize();
    }
}
