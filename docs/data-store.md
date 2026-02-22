# Data Store Usage

## 목적
- 서버 전용 Firebase Admin/Firestore 로직과 클라이언트 Firebase SDK 사용을 분리합니다.
- 잘못된 번들링(예: firebase-admin이 브라우저로 포함되는 문제)을 방지합니다.

## 모듈 구성
- `src/lib/data-store/server.ts`
  - 서버 전용 구현
  - `server-only` 적용
  - Next.js 서버 컴포넌트, 서버 액션, Route Handler에서 사용

- `src/lib/data-store/client.ts`
  - 클라이언트 전용 구현
  - 브라우저에서 실행되는 컴포넌트/훅에서 사용

- `src/lib/data-store/index.ts`
  - 서버 전용 re-export
  - 서버 코드에서 `@/lib/data-store`로 사용

## 사용 규칙
- 서버 코드: `@/lib/data-store`
- 클라이언트 코드: `@/lib/data-store/client`

## 예시

### 서버 (Server Component / Server Action)
```ts
import { getUsers } from '@/lib/data-store';
```

### 클라이언트 (Client Component)
```ts
import { getReserveFundBalance } from '@/lib/data-store/client';
```
