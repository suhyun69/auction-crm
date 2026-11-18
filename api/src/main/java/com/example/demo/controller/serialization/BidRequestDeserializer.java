package com.example.demo.controller.serialization;

import com.example.demo.controller.dto.BidWebRequest;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;

/** 응찰에만 엄격한 JSON 타입 검사를 적용해 기존 API의 바인딩 동작을 보존한다. */
public final class BidRequestDeserializer extends JsonDeserializer<BidWebRequest> {
    @Override
    public BidWebRequest deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        JsonNode node = parser.getCodec().readTree(parser);
        JsonNode name = node.get("customerName");
        JsonNode amount = node.get("amount");
        if (!node.isObject() || name == null || !name.isTextual()
                || amount == null || !amount.isIntegralNumber() || !amount.canConvertToLong()) {
            return (BidWebRequest) context.handleUnexpectedToken(BidWebRequest.class, parser);
        }
        if (parser.nextToken() != null) {
            return (BidWebRequest) context.handleUnexpectedToken(BidWebRequest.class, parser);
        }
        return new BidWebRequest(name.textValue(), amount.longValue());
    }
}
