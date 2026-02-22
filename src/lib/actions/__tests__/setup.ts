import { afterEach, vi } from 'vitest';

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

afterEach(() => {
  errorSpy.mockClear();
});
