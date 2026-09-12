import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAuthToken, getRefreshToken, refreshTokens } from '../lib/auth'

describe('Auth Utilities', () => {
  it('shares one token refresh across concurrent uploads', async () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue('refresh-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ access_token: 'new-token', refresh_token: 'new-refresh' })));
    try {
      expect(await Promise.all([refreshTokens(), refreshTokens(), refreshTokens()])).toEqual(['new-token', 'new-token', 'new-token']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.getItem = vi.fn()
    window.localStorage.setItem = vi.fn()
    window.localStorage.removeItem = vi.fn()
  })

  describe('getAuthToken', () => {
    it('should return null when no token exists', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue(null)
      const token = getAuthToken()
      expect(token).toBeNull()
      expect(window.localStorage.getItem).toHaveBeenCalledWith('clientpix_token')
    })

    it('should return token when it exists', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue('test-token')
      const token = getAuthToken()
      expect(token).toBe('test-token')
    })
  })

  describe('getRefreshToken', () => {
    it('should return null when no refresh token exists', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue(null)
      const token = getRefreshToken()
      expect(token).toBeNull()
      expect(window.localStorage.getItem).toHaveBeenCalledWith('clientpix_refresh_token')
    })

    it('should return refresh token when it exists', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue('test-refresh-token')
      const token = getRefreshToken()
      expect(token).toBe('test-refresh-token')
    })
  })
})

describe('Token Storage Keys', () => {
  it('should use correct key for access token', () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null)
    getAuthToken()
    expect(window.localStorage.getItem).toHaveBeenCalledWith('clientpix_token')
  })

  it('should use correct key for refresh token', () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null)
    getRefreshToken()
    expect(window.localStorage.getItem).toHaveBeenCalledWith('clientpix_refresh_token')
  })
})
