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
