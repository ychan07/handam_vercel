# 한담 관리자 UI 개선

관리자 화면을 기존 React 진입점에 연결했다. 일반 앱의 `.device` 외부에서 전체 화면을 사용하며, 기존 로그인 API·관리자 API·Firebase 데이터 구조는 유지한다.

## 코드 구조

| 파일 | 책임 |
| --- | --- |
| `src/admin/bridge.tsx` | 초기 진입 대기, mount/unmount, 앱 프레임 전환, 요청 취소와 뷰포트 이벤트 정리 |
| `src/admin/AdminApp.tsx` | 헤더, 통계, 검색·필터·정렬·페이지, 카드와 패널 연결 |
| `src/admin/Panels.tsx` | 사용자 상세·계정 설정·작업 확인·비밀번호와 링크 처리 |
| `src/admin/store.ts` | 상태 코드가 있는 API 오류, 병렬·원자적 조회, 중복 작업 잠금, 세션 종료 |
| `src/admin/model.ts` | 검색·정렬·페이지 보정·CSV·한국 시간 표시·비밀번호 검증 |
| `src/admin/types.ts` | 세션·사용자·통계·브리지 타입 |
| `src/components/ui/` | 공식 shadcn CLI로 추가한 Radix 컴포넌트, 관리자 포털 컨텍스트 |
| `src/index.css` | `.handam-admin` 전용 토큰·기본 스타일·모바일/PC 레이아웃 |

기존 `app.js`의 관리자 문자열 렌더링과 DOM 이벤트 코드는 제거했다. 관리자 토큰은 기존과 같이 JSON 요청 본문의 `adminToken`으로 전달한다. 관리자 설정 성공 시 메모리·헤더·`sessionStorage`가 함께 변경된다.

## 주요 동작

- 가입일 최신순, 페이지당 20명 기본값. 최근 활동순·이름순, 50·100명 선택 지원.
- 검색·필터에 맞는 **전체 결과**를 CSV로 내보낸다. 모든 셀을 인용 처리하고 스프레드시트 수식으로 실행될 수 있는 문자열은 텍스트로 처리한다.
- 통계·사용자를 병렬 조회하되 두 요청이 모두 성공해야 화면과 갱신 시각을 교체한다. 실패하면 기존 결과를 유지한다.
- 정지·해제·삭제 후 통계와 목록을 함께 갱신한다. 서버 작업만 성공하고 재조회가 실패한 상태를 별도로 안내하고, 최신 상태가 확인될 때까지 추가 변경 작업을 잠근다.
- 삭제 확인창은 로그인 계정만 삭제되며 프로필·일기·접속 기록은 삭제되지 않음을 설명한다.
- 비밀번호 공백을 보존한다. 사용자 6자, 관리자 4자 기준과 확인 필드를 제공한다. 닫기·성공·로그아웃 시 입력을 제거한다.
- 관리자 모달과 선택 메뉴는 전용 포털에서 같은 테마를 상속한다. 화면 종료 후 포커스·포털·스크롤 잠금과 진행 중 요청을 정리한다.
- 전역 Tailwind preflight를 추가하지 않았다. 관리자 전용 transform/ring 기본값을 제공하고 기존 `.list-item` 클래스와 충돌하는 Tailwind 유틸리티 생성을 차단했다.
- viewport 확대 제한 및 전역 확대 차단 이벤트를 제거했다.

## 검증

```sh
npm run typecheck
npm run test:admin
npm run build
npm run test:admin:browser
```

핵심 상태 테스트 15개, 브라우저 테스트 18개를 실행한다. 브라우저 검증은 Windows Microsoft Edge를 사용한다. `tests/static-server.cjs`는 정적 파일만 제공하고 API 요청은 테스트에서 모킹한다. 실제 운영 계정에는 변경 작업을 수행하지 않는다.

검증 범위:

- 0·1·20·21·1,000명, 검색·정렬·페이지 크기·CSV 전체 결과·마지막 페이지 삭제 보정.
- 병렬 조회, 부분 실패, 이전 응답 지연, 중복 클릭, 작업 성공 후 갱신 실패, 세션 만료, 로그아웃 직전 응답.
- 비밀번호 길이·확인·공백·현재 비밀번호 오류·변경 없음·저장 실패·복사 실패·즉시 이름 반영.
- 360·390·768·1440px, 밝은·어두운 테마, 긴 이메일, 확인창 화면 경계, 키보드 포커스와 복귀, 감소된 모션.
- 200%에 해당하는 논리 뷰포트/픽셀 배율과 `visualViewport` 높이 축소를 이용한 키보드 상태 시뮬레이션.
- 실제 `index.html`과 `app.js`를 실행하되 Firebase 모듈·API·로컬 DB 응답을 대체한 일반 로그인→관리자→로그아웃→일반 로그인→홈→설정→운세 로딩 흐름. 스플래시 완료 및 관리자 종료 후 포털·스크롤 잠금 정리 확인.

실물 iOS/Android의 가상 키보드와 화면 낭독기는 직접 검증하지 않았다. 브라우저 자동화는 위 시뮬레이션과 DOM 접근성·키보드 동작을 확인한다. 빌드에는 기존 단일 번들 구성에 따른 500 kB 초과 경고가 남는다.

기존 스플래시·운세 로딩의 타입 오류도 전체 타입 검사를 위해 보완했다. 누락된 기본값 키 타입, 이미 반환한 상태에 대한 중복 조건, `RotatingText` 선언 타입을 정리했으며 애니메이션 동작은 유지한다.

## 검증 캡처

캡처는 테스트가 생성하는 로컬 산출물이며 Git에서 제외한다. 다음 링크는 프로젝트 안에서 열 수 있다.

- [모바일 목록](../output/playwright/captures/list-390-light.png)
- [모바일 개요](../output/playwright/captures/overview-390-light.png)
- [사용자 상세](../output/playwright/captures/mobile-detail.png)
- [삭제 확인창](../output/playwright/captures/mobile-confirm.png)
- [갱신 오류 상태](../output/playwright/captures/mobile-error.png)
- [PC 화면](../output/playwright/captures/overview-1440-light.png)
- [어두운 테마](../output/playwright/captures/list-390-dark.png)
- [키보드 높이 시뮬레이션](../output/playwright/captures/mobile-keyboard-resize.png)
- [일반 홈 회귀](../output/playwright/captures/regression-home.png)
- [일반 설정 회귀](../output/playwright/captures/regression-settings.png)
- [Playwright 결과 보고서](../output/playwright/report/index.html)

## 구현 참고

[공식 shadcn 스킬](https://ui.shadcn.com/docs/skills)의 프로젝트 확인·검색·문서 확인·변경 미리보기 절차를 적용했다. MCP가 연결되어 있지 않아 설치된 공식 CLI의 `info`, `search`, `docs`, `add --dry-run`, `add`를 사용했다. [React 18·Tailwind 3 호환성 안내](https://ui.shadcn.com/docs/tailwind-v4)에 따라 기존 버전을 유지했다.

서버 페이지네이션·대량 작업·데이터 마이그레이션·배포는 포함하지 않는다.
