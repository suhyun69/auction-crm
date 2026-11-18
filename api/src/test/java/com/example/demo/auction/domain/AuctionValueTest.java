package com.example.demo.auction.domain;

import com.example.demo.common.exception.InvalidInputException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class AuctionValueTest {
    @ParameterizedTest
    @ValueSource(longs = {1, 9_007_199_254_740_991L})
    void validAmountBoundaries(long amount) {
        assertThat(new BidAmount(amount).value()).isEqualTo(amount);
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1, Long.MIN_VALUE, 9_007_199_254_740_992L, Long.MAX_VALUE})
    void invalidAmountBoundaries(long amount) {
        assertThatThrownBy(() -> new BidAmount(amount)).isInstanceOf(InvalidInputException.class);
    }

    @Test
    void normalizedNamePreservesInnerWhitespaceAndCase() {
        assertThat(new CustomerName(" \t홍 길동\n ").value()).isEqualTo("홍 길동");
        assertThat(new CustomerName(" Alice ")).isEqualTo(new CustomerName("Alice"));
        assertThat(new CustomerName("alice")).isNotEqualTo(new CustomerName("Alice"));
        assertThat(new CustomerName("홍 길동")).isNotEqualTo(new CustomerName("홍길동"));
    }

    @Test
    void nameLengthIsCheckedAfterStripping() {
        assertThat(new CustomerName(" 가 ").value()).hasSize(1);
        assertThat(new CustomerName(" " + "가".repeat(100) + " ").value()).hasSize(100);
        assertThatThrownBy(() -> new CustomerName("가".repeat(101))).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> new CustomerName(null)).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> new CustomerName(" \t\n")).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> new CustomerName("")).isInstanceOf(InvalidInputException.class);
    }
}
