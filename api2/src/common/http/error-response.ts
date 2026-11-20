import { STATUS_CODES } from 'node:http';

/**
 * 오류 응답 본문. `api/`의 ErrorResponse와 같은 모양이다.
 * fieldErrors는 api/에서도 Bean Validation 실패에만 쓰였고, api2의 경로에서는 쓰지 않는다.
 */
export type ErrorResponse = {
  timestamp: string;
  status: number;
  error: string;
  message: string;
};

export function errorResponse(status: number, message: string): ErrorResponse {
  return {
    timestamp: new Date().toISOString(),
    status,
    error: STATUS_CODES[status] ?? 'Error',
    message,
  };
}

export const UNREADABLE_BODY = '요청 본문을 읽을 수 없습니다.';
export const INTERNAL_ERROR = '서버 내부 오류가 발생했습니다.';
