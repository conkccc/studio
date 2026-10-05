import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

describe('navigation shortcut and API authorization boundary', () => {
  it('redirects an anonymous private page to login', () => {
    const response = middleware(new NextRequest('http://localhost/meetings'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });
  it.each(['/api/meetings', '/api/app-data?resource=prep-detail&id=p1&shareToken=token', '/api/auth/session'])('lets the API return its own authorization result: %s', path => {
    const response = middleware(new NextRequest('http://localhost' + path));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });
});
