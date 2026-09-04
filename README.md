# Handam (한담) - AI 기반 일기 및 기록 서비스

AI 기술(OCR, LLM)을 활용하여 사용자의 아날로그 감성(손글씨 일기)을 디지털로 전환하고, 개인 맞춤형 운세 및 글감을 제공하는 **모바일 퍼스트 웹 앱(PWA)**입니다.

## 🚀 주요 기능 및 구현 방법론

### 1. OCR 기반 일기 요약 및 저장 시스템
*   **구현 파이프라인**:
    1.  **이미지 입력**: 모바일 환경 최적화 업로드 (Camera API 활용).
    2.  **OCR (Naver Clova)**: 텍스트 추출.
    3.  **LLM 정규화 및 요약 (Gemini)**: 오타 교정 및 사용자 설정(페르소나)에 따른 요약.
*   **데이터 저장 (계정 동기화)**:
    *   Firebase Authentication UID별로 `users/{uid}/diaries`에 일기를 저장합니다.
    *   `users/{uid}`에는 화면·알림·AI 페르소나·운세 입력 설정을 저장합니다.
    *   마지막으로 불러온 데이터는 UID별 `localStorage` 캐시에 남겨 일시적인 네트워크 오류에도 표시합니다.
    *   기존 `handam-sqlite` 일기는 최초 로그인 사용자에게 한 번만 마이그레이션됩니다.

### 2. LLM 기반 개인 맞춤형 글감 추천
*   **방법론**: 사용자의 **누적된 일기 요약 데이터**를 컨텍스트로 LLM에 전달.
*   **프로세스**: 
    1. 로컬 DB에서 최근 요약 데이터 추출.
    2. LLM(Gemini)이 사용자의 현재 관심사, 감정 상태를 분석.
    3. 분석 결과에 기반한 "오늘의 질문" 또는 "글감" 생성 및 추천.

### 3. 인증 및 보안 시스템
*   **자체 인증**: JWT(JSON Web Token) 기반의 회원가입/로그인 구현.
*   **세션 관리**: `httpOnly`, `Secure` 쿠키를 이용한 Refresh Token 관리로 자동 로그인 및 보안 강화.
*   **확장성**: 향후 OAuth 2.0(카카오, 구글) 통합이 용이하도록 Passport.js 또는 Auth.js 구조 설계.

---

## 🎨 UI/UX 전략 (Toss-style Minimalism)

*   **배치**: 토스(Toss)와 같은 **카드 기반 레이아웃**과 **여백의 미**를 강조.
*   **인터랙션**: 모바일 사용성을 고려한 바텀 시트(Bottom Sheet), 스와이프 액션 활용.
*   **색상**: 화이트/라이트 그레이 배경에 핵심 액션 포인트만 강조하는 깔끔한 톤.

---

## 🛠 기술 스택 (확정 및 제안)

*   **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, Framer Motion (애니메이션)
*   **Backend**: Next.js API Routes 또는 Node.js (Express)
*   **Database**: 
    *   **Local**: SQLite Wasm (추천) 또는 IndexedDB
    *   **Auth**: PostgreSQL (사용자 계정 및 최소 정보 저장용 - 필요 시)
*   **AI/OCR**: Naver Clova OCR, Google Gemini API
*   **Deployment**: Vercel (PWA 지원 설정 포함)

---

## 🔐 보안 및 성능 최적화 계획

1.  **쿠키 기반 보안**: XSS 공격 방지를 위해 액세스 토큰은 메모리에, 리프레시 토큰은 `httpOnly` 쿠키에 저장.
2.  **PWA 구현**: '홈 화면에 추가' 기능 및 오프라인 접근성 확보.
3.  **OCR 최적화**: 이미지 업로드 전 클라이언트 사이드에서 리사이징을 수행하여 데이터 비용 및 속도 개선.

---

## ⚙️ 실행 전 환경 변수

루트에 `.env` 파일을 만들고 아래 값을 채워주세요(`.env.example` 참고).

- `FIREBASE_WEB_API_KEY`: Firebase Authentication REST API 키
- `CLOVA_OCR_INVOKE_URL`, `CLOVA_OCR_SECRET`: Naver Clova OCR 호출 정보
- `GEMINI_API_KEY`: Gemini 요약 생성용 API 키
- `GEMINI_MODEL`: Gemini 모델명(선택, 기본값 `gemini-2.5-flash`)
- `FORTUNE_API_URL`: 운세 API URL (`{birthday}` 치환 지원)

실행:

```bash
npm run start
```

---

## Firebase 설정 체크리스트

아래 순서대로 하면 로그인/회원가입/비밀번호 변경이 동작합니다.

1. Firebase 프로젝트 생성/선택
   - [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 생성하거나 기존 프로젝트를 선택

2. Authentication 활성화
   - [Authentication Providers](https://console.firebase.google.com/project/_/authentication/providers) 이동
   - 프로젝트 선택 후 **Email/Password** 활성화

3. Web API 키 확인
   - 프로젝트 설정 > 일반 > 웹 앱 구성에서 `apiKey` 확인
   - 값을 `.env`의 `FIREBASE_WEB_API_KEY`에 입력

4. Firebase CLI 로그인
   - `npx -y firebase-tools@latest login`
   - 원격/헤드리스 환경이면 `--no-localhost` 옵션 사용

5. Firestore 연결 및 규칙/인덱스 배포
   - 기본 대상은 `.firebaserc`에 지정된 `handam-981b6` 프로젝트의 `(default)` 데이터베이스입니다.
   - 프로젝트 루트에서 아래 명령 실행:
     ```bash
     npx -y firebase-tools@latest deploy --only firestore --project handam-981b6
     ```
   - `firestore.rules`는 로그인한 사용자가 자기 `users/{uid}`와 `users/{uid}/diaries/{diaryId}` 경로만 읽고 쓰도록 제한합니다.
   - `firestore.indexes.json`은 조회하지 않는 큰 일기 본문/요약 필드의 인덱스를 제외합니다.

6. 환경 변수 작성
   - `.env.example`을 `.env`로 복사하고 모든 키 채우기
   - 아래 명령으로 누락 키 확인:
     ```bash
     npm run verify:env
     ```

7. 앱 실행 및 인증 테스트
   - `npm run start`
   - 로그인/회원가입 테스트
   - 비밀번호 변경 테스트
   - 테스트 계정: `admin` / `admin`

---

## Vercel 배포 가이드

이 프로젝트는 Vercel에서 아래 구조로 동작합니다.

- 정적 앱: `dist` (`index.html`, `app.js`, `styles.css`, `db-worker.js`)
- 서버리스 API: `api/*`
  - `/api/auth/login`
  - `/api/auth/register`
  - `/api/auth/change-password`
  - `/api/ocr`
  - `/api/llm/summarize`
  - `/api/fortune`

### 1) Vercel 환경변수 입력

Vercel 프로젝트 대시보드에서 아래 경로로 이동:

- Settings -> Environment Variables

다음 키를 **Production / Preview / Development**(필요한 환경만) 에 입력:

- `FIREBASE_WEB_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT` (Firebase 서비스 계정 JSON 전체를 한 줄로 입력)
- `ADMIN_JWT_SECRET`
- `CLOVA_OCR_INVOKE_URL`
- `CLOVA_OCR_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (선택, 기본값 `gemini-2.5-flash`)
- `FORTUNE_API_URL`
- `PORT` (선택, Vercel에서는 보통 불필요)

`FORTUNE_API_URL` 예시:

- `https://api.example.com/fortune?birthday={birthday}`

### 2) Firebase authorized domain 설정

Google 로그인의 `unauthorized domain` 오류를 막으려면 Firebase Console에서 다음 도메인을 추가하세요.

- Firebase Console -> Authentication -> Settings -> Authorized domains
- `localhost`
- `127.0.0.1`
- `<your-project>.vercel.app`
- 커스텀 도메인 사용 시 해당 도메인 (예: `handam.com`)

### 3) 배포

- Git 연동 후 Vercel에서 Deploy
- 또는 CLI 사용 시 `vercel --prod`

배포 후 Google 로그인, OCR, 요약, 운세 API를 순서대로 점검하세요.

환경변수는 브라우저 번들에 포함되지 않으며 `/api/ocr`, `/api/llm/summarize` 서버리스 함수에서만 읽습니다. OCR은 `CLOVA_OCR_INVOKE_URL`과 `CLOVA_OCR_SECRET` 두 값이 모두 필요하고, Gemini는 `GEMINI_API_KEY`만 필수입니다.

외부 서비스 호출 형식은 실제 키를 노출하지 않는 어댑터 검사로 확인할 수 있습니다.

```bash
npm run verify:services
```
