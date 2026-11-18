package com.example.demo.auction.application.port.out;
import com.example.demo.auction.domain.*;
import java.util.*;
public interface ParticipantRepositoryPort {
    Participant save(Participant participant); Optional<Participant> findByName(CustomerName name); Optional<Participant> findById(long id); List<Participant> findAll();
}
