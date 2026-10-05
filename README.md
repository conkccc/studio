# N빵친구

친구 그룹, 모임 일정 조율, 지출과 정산을 관리하는 Next.js / Firebase 앱입니다.

## 개발 실행

Node.js 22를 사용합니다. 보안 업데이트에 맞춰 Firebase Admin과 테스트 도구의 런타임 기준을 통일했습니다.

```sh
npm ci
npm run dev
```

개발 서버는 `http://localhost:9002`에서 실행합니다.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## 환경 설정

`.env.example`을 `.env.local`로 복사하고 기존 Firebase 프로젝트의 공개 설정을 입력합니다. Google Maps API 키는 선택 사항이며, 키 없이도 장소를 직접 입력할 수 있습니다.

서버는 Firebase Admin SDK를 사용합니다. 로컬에서는 저장소 밖에 둔 서비스 계정 파일의 절대 경로를 `GOOGLE_APPLICATION_CREDENTIALS`로 지정하거나 Application Default Credentials를 설정합니다. `FIREBASE_SERVICE_ACCOUNT`는 JSON과 Base64로 인코딩한 JSON을 지원합니다. Vercel에서는 이 서버용 자격 증명을 별도로 설정해야 합니다. Firebase App Hosting에서는 런타임에 할당된 서비스 계정의 기본 자격 증명을 사용합니다.

계정은 Firestore 접근과 Firebase Authentication 세션 생성·검증 권한이 필요합니다. 비밀 키는 저장소에 넣지 않습니다. 서비스 계정 초기화는 요청 시점에 수행하므로 빌드에는 서비스 계정 파일이 필요하지 않습니다.

## 로그인과 권한

Google 로그인 후 검증된 ID 토큰으로 5일 유효한 HttpOnly `__session` 쿠키를 발급합니다. 로그인·로그아웃은 동일 출처와 CSRF 토큰을 확인하고, 보호된 서버 액션은 서명·만료·철회 여부와 현재 사용자 역할을 검증합니다.

신규 계정은 `role: none`으로 생성되며 관리자의 승인을 받아야 합니다. 이 개편 이전에 로그인한 사용자는 새 서버 세션을 만들기 위해 한 번 다시 로그인해야 합니다.

공개 모임 준비의 조회·응답 제출은 매 요청마다 유효한 공유 토큰을 요구합니다. 수정용 비밀번호는 scrypt 해시로 보관하며 브라우저에 반환하지 않습니다. 기존 평문 비밀번호는 올바른 비밀번호로 응답을 저장할 때 해시로 전환합니다.

## 배포 전 확인

`firestore.indexes.json`에는 커서 조회에 필요한 복합 인덱스가 있습니다. 기존 프로젝트 인덱스와 합친 뒤 실제 Firebase 프로젝트에 배포합니다. `firestore.rules`는 브라우저의 직접 데이터 접근을 차단하며, 데이터 접근은 서버 액션으로 수행합니다. 이 저장소의 파일 변경은 클라우드 설정을 자동 배포하지 않습니다. 다른 앱이 같은 Firestore를 공유한다면 해당 규칙을 그대로 적용하기 전에 다른 앱의 접근 요구를 반영해야 합니다.

서비스 계정, 실제 Google 로그인, 공유 링크, 인덱스 생성 완료는 실제 배포 환경에서 확인해야 합니다. 로컬 테스트는 Firebase 프로젝트에 읽기·쓰기를 하지 않습니다.

기존 자료의 날짜가 문자열로 저장되어 있다면 새 커서 목록을 사용하기 전에 Timestamp로 정규화해야 합니다. 먼저 서비스 계정과 대상 프로젝트를 설정한 터미널에서 `npm run migrate:dates`를 실행하면 변경 대상 개수만 확인합니다. 결과를 검토하고 백업한 뒤 `npm run migrate:dates -- --apply`로 정규화합니다. 정상 Timestamp와 정산 금액은 수정하지 않으며, 동시 수정된 값은 건너뜁니다. `.env.local`은 이 Node 스크립트에서 자동 로드하지 않습니다.

## 구조와 과거 기록

화면 테마는 기본적으로 운영체제 설정을 따릅니다. 상단 테마 메뉴에서 시스템 설정·밝게·어둡게를 선택할 수 있고, 선택은 브라우저에 저장됩니다. 로그인과 공유 화면에도 동일하게 적용됩니다.

- `src/app`: 페이지와 인증 API
- `src/features`: 기능별 화면과 입력 컴포넌트
- `src/lib/services/access.ts`: 그룹·모임 권한
- `src/lib/actions`: 검증된 서버 기능
- `src/lib/data-store`: Admin SDK 저장소
- `src/lib/settlement.ts`: 원 단위 정산과 송금 계산

브라우저 조회는 계정별 메모리 캐시와 GET API를 사용하고, 저장·삭제는 검증된 서버 액션으로 처리합니다. Firestore에 직접 접근하지 않습니다. 세부 조회·보관·정산 정책과 성능·보안 점검 기록은 [데이터 저장소 설명](docs/data-store.md)에 있습니다.

친구·그룹 삭제는 현재 목록에서 제외하는 보관 처리입니다. 과거 모임의 참여자와 지출은 유지합니다. 확정된 정산은 결과를 저장하고, 수정하려면 먼저 정산을 다시 열어야 합니다. 기존 저장된 결과가 없는 확정 자료는 원 단위 정책으로 재구성했음을 화면에 표시하며, 기록된 회비 사용액은 보존합니다.

[Firebase 세션 쿠키 문서](https://firebase.google.com/docs/auth/admin/manage-cookies)
