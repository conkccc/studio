# Repository Guidelines

## 프로젝트 구조 및 모듈 구성
- `src/app`에 Next.js App Router 라우트와 페이지가 있습니다.
- `src/components`에 공용 UI 및 기능 컴포넌트를 둡니다.
- `src/contexts`, `src/hooks`는 Context와 커스텀 훅을 담습니다.
- `src/lib`는 공용 유틸과 데이터 접근 로직을 둡니다.
- 루트 설정 파일: `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `tsconfig.json`.
- `apphosting.yaml`, `serviceAccountKey.json`은 배포/런타임 관련 파일입니다.

## 빌드, 테스트, 개발 명령어
- `npm run dev`: Turbopack으로 개발 서버를 `9002` 포트에 실행합니다.
- `npm run build`: 프로덕션 빌드를 생성합니다.
- `npm run start`: 빌드 후 프로덕션 서버를 실행합니다.
- `npm run lint`: Next.js ESLint 체크를 수행합니다.
- `npm run typecheck`: 타입스크립트 타입 체크만 수행합니다.

## 코딩 스타일 및 네이밍 규칙
- 언어는 TypeScript/TSX를 사용합니다.
- 들여쓰기는 기존 파일 기준 2칸을 따릅니다.
- 컴포넌트/훅 이름은 의미가 명확하게 작성합니다 (예: `ReserveFundClient`, `useAuth`).
- 스타일링은 Tailwind 유틸리티 클래스를 우선합니다.
- PR 전 `npm run lint`와 `npm run typecheck`를 권장합니다.

## 테스트 가이드
- 현재 전용 테스트 프레임워크나 테스트 파일이 없습니다.
- 테스트를 추가한다면 `src/**/__tests__/*` 또는 `*.test.tsx` 패턴을 권장하며, 실행 스크립트를 `package.json`에 문서화합니다.

## 커밋 및 PR 가이드
- 최근 커밋은 짧고 명확한 한국어 요약입니다 (예: “버그 수정 …”).
- 동일한 톤으로 한 가지 변경 사항에 집중해 작성합니다.
- PR에는 변경 설명, 관련 이슈 링크(있다면), UI 변경 시 스크린샷을 포함합니다.

## 보안 및 설정 팁
- Firebase/Google Maps 환경 변수가 필요합니다. `README.md`를 참고하세요.
- 비밀 정보는 커밋하지 말고 `.env`에만 보관합니다.
- `serviceAccountKey.json`은 필요 시에만 수정합니다.
