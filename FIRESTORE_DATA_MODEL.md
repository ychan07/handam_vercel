# Firestore 저장 항목

대상은 Firebase 프로젝트 `handam-981b6`의 `(default)` 데이터베이스입니다.

## `users/{uid}`

| 필드 | 형식 | 내용 |
| --- | --- | --- |
| `uid` | string | Firebase Authentication 사용자 ID |
| `email` | string | 로그인 이메일 |
| `displayName` | string | 화면 표시 이름 |
| `settings.theme` | `light` 또는 `dark` | 화면 테마 |
| `settings.recordReminder` | boolean | 기록 알림 사용 여부 |
| `settings.summaryQuality` | `표준`, `고급`, `최고` | AI 요약 품질 설정 |
| `settings.persona` | `따뜻한 공감형`, `담백한 정리형` | 기본 AI 페르소나 |
| `settings.lunarCalendar` | boolean | 음력 생일 여부 |
| `settings.fortuneBirthday` | `YYYY-MM-DD` 또는 빈 문자열 | 운세용 생일 |
| `migrationVersion` | integer | 로컬 일기 마이그레이션 버전 |
| `updatedAt` | timestamp | 마지막 갱신 시각 |

## `users/{uid}/diaries/{diaryId}`

| 필드 | 형식 | 내용 |
| --- | --- | --- |
| `uid` | string | 문서 소유자 ID |
| `title` | string | 일기 제목 |
| `body` | string | 원문 또는 OCR 확인 후 수정한 본문 |
| `mood` | string | 선택한 감정 |
| `summary` | string | Gemini 요약, 실패 시 본문 |
| `aiPersona` | string | 이 요약에 사용한 AI 페르소나 |
| `aiModel` | string | 사용한 Gemini 모델, AI 미사용 시 빈 문자열 |
| `summaryQuality` | string | 이 요약에 사용한 품질 설정 |
| `summaryGenerated` | boolean | Gemini가 요약을 생성했는지 여부 |
| `entryDate` | `YYYY-MM-DD` | 일기 날짜 |
| `createdAt` | timestamp | 생성 시각 |
| `syncedAt` | timestamp | Firestore 동기화 시각 |
| `updatedAt` | timestamp | 마지막 갱신 시각 |

## 서버 전용 컬렉션

- `handam_admin/config`: 관리자 로그인 설정. Firebase Admin SDK만 접근합니다.
- `handam_presence/{uid}`: 최근 접속 시각과 사용자 표시 정보. 검증된 Firebase ID 토큰으로만 서버가 기록합니다.

## AI 페르소나

- `따뜻한 공감형`: 감정을 존중하는 부드러운 문장으로 요약하며, 원문에 없는 감정을 만들지 않습니다.
- `담백한 정리형`: 사실과 사건 흐름을 중심으로 짧고 명확하게 요약하며, 과도한 해석을 덧붙이지 않습니다.

사용자의 기본 선택은 `settings.persona`에, 실제 일기 요약에 사용된 값은 각 일기의 `aiPersona`에 저장됩니다. 페르소나 행동 지침 원본은 서버 코드 `api/personas.js`에서 관리되어 클라이언트가 임의 지침을 주입할 수 없습니다.
