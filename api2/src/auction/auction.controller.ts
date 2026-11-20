import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuctionService } from './auction.service.js';
import {
  bidResponseSchema,
  dashboardResponseSchema,
  errorResponseSchema,
  type BidResponse,
  type DashboardResponse,
} from './dto/auction.responses.js';
import { submitBidSchema, type SubmitBid } from './dto/submit-bid.schema.js';

/** HTTP만 다룬다: 경로, 상태 코드, 헤더를 정하고 서비스 하나를 부른다. */
@ApiTags('Auction')
@Controller('api')
export class AuctionController {
  constructor(private readonly auction: AuctionService) {}

  /** 승인·기각 모두 200. @Post()의 기본값은 201이라 명시한다. */
  @Post('bid')
  @HttpCode(200)
  @ApiOperation({
    summary: '응찰 등록',
    description:
      '최고가를 초과하면 승인, 같거나 낮으면 기각. 모두 저장하며 200을 반환한다. 같은 키·이름·금액 재전송은 최초 응답을 그대로 반환한다.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: '선택. 공백만인 키 제외 1~200자. 재시도 시 같은 값',
  })
  @ApiOkResponse({
    description: '승인 또는 기각',
    standardSchema: bidResponseSchema,
  })
  @ApiBadRequestResponse({
    description: '잘못된 이름·정수 금액·멱등 키',
    standardSchema: errorResponseSchema,
  })
  @ApiConflictResponse({
    description: '같은 멱등 키의 요청 내용 불일치',
    standardSchema: errorResponseSchema,
  })
  submitBid(
    @Body({ schema: submitBidSchema }) body: SubmitBid,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BidResponse> {
    return this.auction.submitBid(body, idempotencyKey);
  }

  @Get('dashboard')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '경매 대시보드',
    description:
      '같은 스냅샷의 요약과 승인 최고가 내림차순 전체 순위. 승인 이력이 없는 참가자는 뒤에 둔다.',
  })
  @ApiOkResponse({ standardSchema: dashboardResponseSchema })
  readDashboard(): Promise<DashboardResponse> {
    return this.auction.readDashboard();
  }
}
