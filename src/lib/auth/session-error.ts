export type SessionStage = 'verification' | 'cookie' | 'profile';

export function getSessionErrorCode(error: unknown): string | number {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code;
    if (typeof code === 'number' && Number.isInteger(code)) return code;
    if (typeof code === 'string' && /^(app|auth)\/[a-z-]+$/.test(code)) return code;
  }
  return 'unknown';
}

// Never send SDK messages to the browser: they can contain credentials, token contents or paths.
export function describeSessionError(error: unknown, stage: SessionStage, development: boolean) {
  const code = getSessionErrorCode(error);
  if (code === 'app/invalid-credential' || code === 'app/invalid-app-options') {
    return {
      status: 503,
      error: development
        ? '서버용 Firebase 자격 증명을 확인해주세요. .env.local의 GOOGLE_APPLICATION_CREDENTIALS에 서비스 계정 JSON 파일 경로를 입력한 뒤 서버를 다시 시작해주세요.'
        : '로그인 서비스 연결 설정에 문제가 있습니다. 관리자에게 문의해주세요.',
    };
  }
  if (code === 'auth/insufficient-permission' || code === 7) {
    return {
      status: 503,
      error: development
        ? '서비스 계정의 Firebase Authentication 및 Firestore 접근 권한을 확인해주세요.'
        : '로그인 서비스에 연결할 수 없습니다. 관리자에게 문의해주세요.',
    };
  }
  if (typeof code === 'string' && ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/argument-error', 'auth/user-disabled', 'auth/user-not-found'].includes(code)) {
    return { status: 401, error: '로그인 인증이 유효하지 않습니다. Google 계정으로 다시 로그인해주세요.' };
  }
  return {
    status: 500,
    error: stage === 'profile'
      ? '사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
      : '서버에서 로그인을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
  };
}
