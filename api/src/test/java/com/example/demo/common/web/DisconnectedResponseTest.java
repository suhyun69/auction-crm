package com.example.demo.common.web;

import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DisconnectedResponseTest {
    @Test
    void disconnectedAsyncResponsePreservesExistingStatusAndBody() throws Exception {
        MockMvcBuilders.standaloneSetup(new DisconnectedController())
                .setControllerAdvice(new GlobalExceptionHandler()).build()
                .perform(get("/test/disconnected-response"))
                .andExpect(status().isAccepted())
                .andExpect(content().string("partial-response"));
    }

    @TestComponent
    @RestController
    static class DisconnectedController {
        @GetMapping("/test/disconnected-response")
        void disconnected(HttpServletResponse response) throws Exception {
            response.setStatus(202);
            response.getWriter().write("partial-response");
            response.flushBuffer();
            throw new AsyncRequestNotUsableException("client disconnected");
        }
    }
}
