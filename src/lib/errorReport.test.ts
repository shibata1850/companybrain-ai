import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportError } from './errorReport';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ERROR_WEBHOOK_URL;
});

describe('reportError', () => {
  it('always logs a structured error line to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('boom'), { route: 'POST /x' });
    expect(spy).toHaveBeenCalled();
    const line = spy.mock.calls[0].join(' ');
    expect(line).toContain('error-report');
    expect(line).toContain('boom');
    expect(line).toContain('POST /x');
  });

  it('redacts secrets from the message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('failed with api_key=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456'));
    const line = spy.mock.calls[0].join(' ');
    expect(line).not.toContain('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
    expect(line.toLowerCase()).toContain('redacted');
  });

  it('never throws on non-Error input', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => reportError('plain string')).not.toThrow();
    expect(() => reportError(null)).not.toThrow();
    expect(() => reportError({ weird: true })).not.toThrow();
  });

  it('posts to the webhook when ERROR_WEBHOOK_URL is set', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    process.env.ERROR_WEBHOOK_URL = 'https://hooks.example/test';
    reportError(new Error('boom'), { route: 'GET /y' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hooks.example/test',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not call fetch when no webhook is configured', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    reportError(new Error('boom'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('通知の連投抑制', () => {
  /**
   * 障害時は同じ例外が毎リクエスト発生する。素通しにすると通知先が
   * 埋まりレート制限にも当たるため、同一内容は一定時間に1回だけ送る。
   * ただし抑制しすぎると監視が意味を失うので、別内容は必ず届くこと、
   * stderr には毎回出ることをテストで固定する。
   */
  it('同じエラーの webhook は1回だけ送る(stderr は毎回出す)', () => {
    process.env.ERROR_WEBHOOK_URL = 'https://example.test/hook';
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'));

    const key = `dup-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      reportError(new Error(key), { route: 'POST /same' });
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1); // webhook は1回
    expect(logSpy).toHaveBeenCalledTimes(5); // ログは毎回
  });

  it('内容が違うエラーはそれぞれ通知する(取りこぼさない)', () => {
    process.env.ERROR_WEBHOOK_URL = 'https://example.test/hook';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'));

    const seed = Math.random();
    reportError(new Error(`a-${seed}`), { route: 'POST /a' });
    reportError(new Error(`b-${seed}`), { route: 'POST /b' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('ERROR_WEBHOOK_URL が未設定なら webhook を呼ばない', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'));
    reportError(new Error(`nohook-${Math.random()}`));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
