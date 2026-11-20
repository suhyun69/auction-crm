import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { judgeBid } from './bid-judgement.js';
import type {
  BidResponse,
  DashboardResponse,
} from './dto/auction.responses.js';
import {
  idempotencyKeySchema,
  type SubmitBid,
} from './dto/submit-bid.schema.js';
import { Auction, AUCTION_ID } from './entities/auction.entity.js';
import { Bid } from './entities/bid.entity.js';
import { Participant } from './entities/participant.entity.js';

export const IDEMPOTENCY_CONFLICT_MESSAGE =
  '동일한 Idempotency-Key가 다른 응찰 요청에 사용되었습니다.';

type StandingRow = {
  participant_id: string;
  customer_name: string;
  bid_count: string;
  highest_accepted_amount: string | null;
  last_bid_at: Date;
};

/**
 * 응찰과 대시보드 규칙. api/의 유스케이스·도메인 서비스·영속성 어댑터가 하던 일을 한 서비스에 모았다.
 * HTTP를 모르며, 실패는 Nest 예외로 알린다(예외 필터가 오류 본문으로 바꾼다).
 */
@Injectable()
export class AuctionService {
  constructor(private readonly em: EntityManager) {}

  async submitBid(bid: SubmitBid, rawKey?: string): Promise<BidResponse> {
    const parsedKey = idempotencyKeySchema.safeParse(rawKey);
    if (!parsedKey.success)
      throw new BadRequestException(parsedKey.error.issues[0]?.message);
    const key = parsedKey.data;

    // @Transactional 자리. 콜백 안의 em은 이 트랜잭션 전용이며, 끝나면 flush 후 커밋한다.
    return this.em.transactional(async (em) => {
      // 경매 행을 잠가 응찰을 한 줄로 세운다. 참가자 생성과 멱등 키 조회도 이 잠금 안에서 한다.
      const auction = await em.findOneOrFail(Auction, AUCTION_ID, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });

      if (key !== null) {
        const previous = await em.findOne(
          Bid,
          { idempotencyKey: key },
          { populate: ['participant'] },
        );
        if (previous) {
          if (
            previous.participant.$.customerName !== bid.customerName ||
            previous.amount !== bid.amount
          ) {
            throw new ConflictException(IDEMPOTENCY_CONFLICT_MESSAGE);
          }
          return toBidResponse(previous);
        }
      }

      const now = new Date();
      const participant =
        (await em.findOne(Participant, {
          auction: AUCTION_ID,
          customerName: bid.customerName,
        })) ??
        em.create(Participant, {
          auction: AUCTION_ID,
          customerName: bid.customerName,
          createdAt: now,
        });

      const judgement = judgeBid(
        {
          highestAmount: auction.highestAmount ?? null,
          highestBidderName: auction.highestBidderName ?? null,
        },
        bid.customerName,
        bid.amount,
      );
      if (judgement.status === 'ACCEPTED') {
        auction.highestAmount = judgement.highestAmount;
        auction.highestBidderName = judgement.highestBidderName;
      }
      const saved = em.create(Bid, {
        participant,
        amount: bid.amount,
        ...judgement,
        createdAt: now,
        idempotencyKey: key,
      });
      // id가 있어야 응답을 만들 수 있으므로 커밋 전에 한 번 flush한다.
      await em.flush();
      return toBidResponse(saved);
    });
  }

  /**
   * 참가자별 집계를 쿼리 한 번으로 읽고, 요약은 그 결과로 계산한다.
   * 요약과 순위가 같은 스냅샷에서 나오므로 서로 어긋나지 않는다.
   */
  async readDashboard(): Promise<DashboardResponse> {
    const rows = await this.em.getConnection().execute<StandingRow[]>(
      `select p.id as participant_id, p.customer_name,
              count(b.id) as bid_count,
              max(case when b.status = 'ACCEPTED' then b.amount end) as highest_accepted_amount,
              max(b.created_at) as last_bid_at
         from auction_participant p
         left join auction_bid b on b.participant_id = p.id
        where p.auction_id = ?
        group by p.id, p.customer_name, p.created_at
        order by highest_accepted_amount desc nulls last, p.created_at, p.id`,
      [AUCTION_ID],
    );
    const participants = rows.map((row, index) => ({
      participantId: Number(row.participant_id),
      customerName: row.customer_name,
      rank: index + 1,
      highestAcceptedAmount:
        row.highest_accepted_amount === null
          ? null
          : Number(row.highest_accepted_amount),
      bidCount: Number(row.bid_count),
      lastBidAt: new Date(row.last_bid_at).toISOString(),
    }));
    const leader = participants.find(
      (participant) => participant.highestAcceptedAmount !== null,
    );
    return {
      summary: {
        bidCount: participants.reduce(
          (sum, participant) => sum + participant.bidCount,
          0,
        ),
        participantCount: participants.length,
        highestAmount: leader?.highestAcceptedAmount ?? 0,
        highestBidderName: leader?.customerName ?? null,
      },
      participants,
    };
  }
}

function toBidResponse(bid: Bid): BidResponse {
  return {
    bidId: bid.id,
    status: bid.status,
    reason: bid.reason,
    submittedAmount: bid.amount,
    highestAmount: bid.highestAmount,
    highestBidderName: bid.highestBidderName,
  };
}
