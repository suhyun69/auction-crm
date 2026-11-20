import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('값이 없으면 기존 Spring API와 같은 기본값을 쓴다', () => {
    const env = parseEnv({});
    expect(env).toMatchObject({
      PORT: 8080,
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: 'auction',
      DB_USERNAME: 'auction',
      DB_MIGRATE_ON_START: true,
      AUCTION_WEB_ALLOWED_ORIGINS: ['http://localhost:3000'],
    });
  });

  it('문자열 환경 변수를 숫자·불리언·원점 목록으로 바꾼다', () => {
    const env = parseEnv({
      PORT: '18080',
      DB_PORT: '55432',
      DB_MIGRATE_ON_START: 'false',
      AUCTION_WEB_ALLOWED_ORIGINS:
        'http://localhost:3000, http://localhost:3100 ,',
    });
    expect(env.PORT).toBe(18080);
    expect(env.DB_PORT).toBe(55432);
    expect(env.DB_MIGRATE_ON_START).toBe(false);
    expect(env.AUCTION_WEB_ALLOWED_ORIGINS).toEqual([
      'http://localhost:3000',
      'http://localhost:3100',
    ]);
  });

  it('잘못된 값이면 시작할 때 멈춘다', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow();
    expect(() => parseEnv({ DB_PORT: '70000' })).toThrow();
    expect(() =>
      parseEnv({ AUCTION_WEB_ALLOWED_ORIGINS: 'not a url' }),
    ).toThrow();
    expect(() => parseEnv({ DB_MIGRATE_ON_START: 'maybe' })).toThrow();
  });
});
