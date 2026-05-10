# Chrome 확장 → 사이트 유입: 좋아요/저장 액션 버튼

- **작성일**: 2026-05-10
- **대상**: `inspireme.chrome`(확장) + `inspireme.advenoh.pe.kr`(사이트)
- **상태**: 디자인 확정, 구현 계획 수립 대기

## 배경 / 문제 정의

`inspireme.chrome`은 새 탭에서 매일 명언과 배경 사진을 보여주는 데일리 터치포인트로 잘 동작한다. 다만 사용자가 명언을 보고 닫는 흐름에서 끝나며, **inspireme 사이트의 회원/방문/사용으로 이어지지 않는다**.

현재 확장의 명언/저자 텍스트는 사이트로 링크되어 있긴 하지만:
- 시각적으로 클릭 가능 여부가 거의 드러나지 않음
- 클릭한 뒤의 보상이 명언 한 페이지뿐, 후속 액션이 없음
- 누적/회고 채널이 없음

## 목표

확장의 명언 표시 영역에 **명시적인 액션 버튼**을 추가해서, 사용자가 마음에 드는 명언을 만났을 때 **사이트로 자연스럽게 유입**되도록 한다.

### 비목표

- Chrome 확장의 전체 UX 재설계
- 확장 자체에 로그인 / 저장 데이터 동기화 기능 추가
- 주간/월간 회고 카드, 알림 등 별도 Engagement 메커니즘 (별도 프로젝트로)

## 핵심 결정

| 항목 | 결정 |
|---|---|
| 추가할 버튼 | **좋아요(♡) + 저장(🔖)** 두 개 |
| 동작 방식 | 딥링크 — 새 탭으로 사이트 이동 후 자동 처리 (Approach A) |
| 처리 위치 | 사이트의 명언 상세 페이지 (`/quotes/{id}`) 클라이언트 useEffect |
| 인증 | 미로그인이면 사이트 로그인 페이지 → returnTo 복귀 후 자동 처리 |

## 섹션 1 — UX/UI 디자인

### 위치 / 모양

```
            "이 또한 지나가리라."
                 — 솔로몬

         [ ♡ 좋아요 ]   [ 🔖 저장 ]    ← 명언+저자 아래, 가로 나란히
```

- 명언+저자 블록 아래 중앙에 두 버튼을 가로로 나란히, 사이 간격 ~12px
- pill 스타일: `text-white/70`, `bg-white/10`, hover 시 `bg-white/20`
- 좋아요: 빈 ♡ + "좋아요"
- 저장: 빈 🔖 (북마크) + "저장"
- 명언 fade-in 직후 200ms 지연으로 등장
- 좁은 새 탭에서도 한 줄에 들어가게 라벨 짧게 유지

### 상태 / 인터랙션

| 상태 | 동작 |
|---|---|
| `quote.id` 없음 (fallback 명언) | 두 버튼 모두 숨김 |
| 좋아요 클릭 | `inspireme.advenoh.pe.kr/quotes/{id}?action=like&lang={lang}&utm_source=chrome_ext&utm_medium=quote_action&utm_campaign=ext_v{version}` 새 탭 |
| 저장 클릭 | 위와 동일하되 `action=save` |
| 미들 클릭 / Cmd+클릭 | `<a>` 태그 기본 동작 (브라우저 새 탭/백그라운드) |

### 의도적으로 빼는 것

- "이미 좋아요/저장됨" 상태 표시 — 확장은 사이트 로그인 상태를 모름. 항상 동일 외형
- 확장 자체의 토스트/피드백 — 사이트 측에서만
- 키보드 단축키

## 섹션 2 — 사이트 측 `?action=` 처리 흐름

### 처리 위치

명언 상세 페이지 `/quotes/{id}` 의 클라이언트 컴포넌트(`frontend/components/quote/quote-detail-client.tsx`). 페이지는 비로그인도 볼 수 있게 그대로 두되, 클라이언트에서 `action` 쿼리 감지 시 동작.

### 플로우

```
새 탭 열림: /quotes/{id}?action=like|save
        │
        ▼
  명언 상세 페이지 정상 로드 (SSR, 비로그인도 볼 수 있음)
        │
        ▼
  클라이언트 useEffect: action 쿼리 감지 (auth 로딩 완료 후)
        │
   ┌────┴────┐
   │ 로그인? │
   └─┬────┬──┘
   No│    │Yes
     │    └──▶ user-interaction API 호출 (idempotent)
     │           │
     │           ▼
     │        토스트 표시 + URL에서 ?action= 제거 (history.replaceState)
     │
     └──▶ 로그인 페이지로 이동 (returnTo = 현재 URL 유지)
              │
              ▼
         로그인 성공 → returnTo로 복귀 → useEffect 재트리거 → 위 Yes 분기
```

### 처리 규칙

| 항목 | 결정 |
|---|---|
| 화이트리스트 | `like`, `save` 만 허용. 그 외는 무시 |
| 중복 호출 방지 | 처리 직후 `history.replaceState`로 쿼리 제거 |
| 이미 좋아요/저장된 상태 | API는 idempotent하게 처리. 토스트는 차별화 ("이미 ...") |
| 실패 시 | 실패 토스트 + 쿼리는 유지 → 새로고침 시 재시도 가능 |
| Analytics | GA 이벤트 `extension_action` 발화 (params: `action`, `quote_id`) |

### 토스트 카피

| 상황 | ko | en |
|---|---|---|
| 좋아요 성공 | 좋아요 표시했어요 ♡ | Liked ♡ |
| 저장 성공 | 내 명언에 저장했어요 🔖 | Saved to your collection 🔖 |
| 이미 좋아요 | 이미 좋아요한 명언이에요 | You've already liked this |
| 이미 저장 | 이미 저장한 명언이에요 | You've already saved this |
| 실패 | 잠시 후 다시 시도해주세요 | Please try again later |

### 변경 범위 (예상)

- `frontend/components/quote/quote-detail-client.tsx` — `useEffect` 추가, 쿼리 핸들링
- `frontend/lib/` — 액션 처리 헬퍼 함수 1개 (선택)
- 백엔드/API 변경 **없음** — 기존 user-interaction API 재사용
- 로그인 페이지 — 이미 returnTo 지원 중이라면 그대로. 없으면 그 부분만 작은 추가

## 섹션 3 — Chrome 확장 측 변경

### 파일 변경 범위

| 파일 | 변경 |
|---|---|
| `src/components/Quote.tsx` | 명언 블록 아래 액션 버튼 영역 추가 |
| `src/components/QuoteActions.tsx` (신규) | 좋아요/저장 두 버튼을 묶은 컴포넌트 |
| `src/lib/constants.ts` | `buildQuoteActionUrl(id, action, lang)` 헬퍼 (선택) |
| `src/lib/analytics.ts` | `trackQuoteAction(action, quoteId)` GA 이벤트 |

### `<QuoteActions />` 동작

- props: `quoteId: string`, `lang?: 'ko' | 'en'`
- 두 개의 `<a>` 태그로 렌더 (button 아니고 anchor — 미들/Cmd 클릭 자연스럽게)
- `href`: `${INSPIREME_BASE_URL}/quotes/${quoteId}?action=like|save&lang={lang}&utm_source=chrome_ext&utm_medium=quote_action&utm_campaign=ext_v{version}`
- `target="_blank"` + `rel="noopener noreferrer"`
- `onClick`에서 GA 이벤트 발화. `preventDefault` 안 함

### 언어 / i18n

- 확장의 현재 언어 설정(`useSettings().lang`)에 맞춰 라벨 `좋아요/저장` ↔ `Like/Save`
- URL에도 `&lang=ko|en` 전달 → 사이트 토스트 언어 일치

### 유입 트래킹 (utm)

- `utm_source=chrome_ext`
- `utm_medium=quote_action`
- `utm_campaign=ext_v{version}` (예: `ext_v0.7.3`)

→ GA에서 Chrome 확장 유입을 별도로 분리해 측정. 향후 액션 버튼 추가/조정의 근거.

### Quote.tsx 통합 모양 (의사 코드)

```tsx
<div className="text-center animate-fade-in">
  {/* 기존: 명언 + 저자 */}
  ...

  {/* 신규: id가 있을 때만 */}
  {hasLink && (
    <div className="mt-6 animate-fade-in-delayed">
      <QuoteActions quoteId={quote.id} lang={settings.lang} />
    </div>
  )}
</div>
```

- `animate-fade-in-delayed`: 기존 fade-in + 200ms 지연 (Tailwind 커스텀 keyframe 추가)

## 섹션 4 — 에러 / 엣지 케이스

### 다뤄야 할 케이스

| 케이스 | 처리 |
|---|---|
| `quote.id` 없음 (fallback) | 버튼 숨김 |
| 같은 액션 중복 호출 | API idempotent + 토스트 차별화 |
| 페이지 새로고침 | `history.replaceState`로 `?action=` 제거 후 재실행 안 됨 |
| auth 로딩 미완료 | useEffect는 `useAuth().loading === false` 인 다음 frame에만 실행 |
| 네트워크 실패 / 5xx | 실패 토스트 + 쿼리 유지 → 새로고침 시 재시도 |
| 명언 삭제 (404) | 명언 페이지 자체 404. action 트리거 안 됨 |
| `action` 위조 (`?action=delete` 등) | 무시. 토스트 안 띄움. URL에서 쿼리만 정리 |
| 로그인 후 사용자가 이탈 | 자연 이탈. 다음 방문에서 다시 시도 가능 |
| 같은 명언 빠른 더블 클릭 | 새 탭 두 개 → 둘 다 idempotent 처리, 결과 동일 |
| GA 차단기로 이벤트 누락 | 정상 흐름은 막지 않음. 측정만 결손 처리 |

### 보안 체크리스트

- **액션 화이트리스트**: 클라이언트에서 `like|save`만 처리. 그 외 무시
- **Open redirect 방지**: 로그인 페이지의 `returnTo`는 같은 origin만 허용 (사이트 정책 — 구현 직전 확인)
- **CSRF**: 기존 user-interaction API의 CSRF 보호 그대로 사용 (브라우저 세션 + same-origin)
- **Rate limit**: 기존 API의 rate limit 그대로 적용
- **utm 파라미터 신뢰 X**: 측정용일 뿐. 비즈니스 로직 분기에 사용 X

### 구현 직전 검증할 가정

1. 사이트 로그인 페이지가 `?returnTo=` 또는 동등한 파라미터를 지원하는가?
2. `useAuth` 훅에 `loading` 상태가 노출되는가? (없으면 추가 필요)
3. user-interaction API가 idempotent한가? 좋아요 두 번 호출 시 에러? 무시? 토글?
   - 가장 자연스러운 정의: `?action=like` = "좋아요 ON으로 만들기" (idempotent set), `?action=unlike`는 만들지 않음

### 의도적으로 빼는 것

- 오프라인 큐잉 / 재시도 로직
- 토스트 외 추가 인터랙션 (저장한 명언으로 바로 이동 같은)
- 확장의 자체 fallback (사이트 다운 시) — 자연 실패로 충분

## 섹션 5 — 테스트 / 검증

### 자동화 테스트

| 영역 | 테스트 포인트 |
|---|---|
| 확장 — `QuoteActions` 단위 | id 없을 때 null 반환 / lang에 따른 라벨 / href 정확성 / GA 호출 인자 |
| 사이트 — action 핸들러 단위 | whitelist 외 값 무시 / 로그인 후 정확히 1회 호출 / 실패 시 쿼리 유지 / 성공 시 replaceState |
| 회귀 | 기존 명언/저자 클릭 → 사이트 이동 그대로 |

### 수동 검증 시나리오

1. **로그인 + 좋아요**: 확장 새 탭 → ♡ 클릭 → 명언 페이지 → 즉시 좋아요 토스트 → URL에서 `?action=` 사라짐 → `/management/liked`에서 보임
2. **로그인 + 저장**: 위와 동일하되 🔖 → `/management/saved`에서 보임
3. **미로그인 + 좋아요**: 확장 → ♡ → 사이트 → 로그인 페이지 (returnTo 보존) → 로그인 → 원 페이지 복귀 → 자동 좋아요 + 토스트
4. **이미 좋아요한 명언**: "이미 좋아요한 명언이에요" 토스트만, 중복 행 안 들어감
5. **Fallback 명언 (id 없음)**: 두 버튼 모두 안 보임
6. **다국어**: ko/en 모드 각각 라벨 + 토스트 언어 일치
7. **미들/Cmd 클릭**: 백그라운드 새 탭에서도 정상 처리
8. **사이트 다운 시뮬레이션**: 새 탭은 일반 브라우저 에러. 확장은 깨지지 않음
9. **빠른 더블 클릭**: 두 새 탭 열려도 사용자 데이터에 중복 없음

### 성공 기준 (출시 후 측정)

- **유입 측정**: GA에서 `utm_source=chrome_ext` 일/주 단위 트래픽 분리 가능
- **액션 완료율**: 액션 트리거 → 토스트 성공 ≥ 90%
- **로그인 전환율**: 미로그인 클릭 → 로그인 완료 비율 — 첫 출시는 베이스라인 측정이 목표
- **버튼별 비율**: 좋아요 vs 저장 클릭 비율 → 향후 한쪽 강조/제거 의사결정 근거

### 의도적으로 빼는 것

- 부하 테스트 — 기존 API 부하 패턴 변화 미미
- A/B 테스트 인프라 — 첫 출시는 단순 출시. 데이터 쌓고 다음 단계에서 검토

## 변경 범위 요약

### inspireme.chrome (확장)

- `src/components/Quote.tsx` — 액션 영역 마운트
- `src/components/QuoteActions.tsx` — 신규
- `src/lib/constants.ts` — URL 헬퍼 (선택)
- `src/lib/analytics.ts` — GA 이벤트 함수
- Tailwind keyframe — `animate-fade-in-delayed` 추가
- i18n 라벨 — 좋아요/저장, Like/Save

### inspireme.advenoh.pe.kr (사이트)

- `frontend/components/quote/quote-detail-client.tsx` — `?action=` 처리 useEffect
- `frontend/lib/` — 액션 처리 헬퍼 (선택)
- 토스트 카피 i18n
- 로그인 페이지 returnTo 지원 — 이미 있으면 변경 없음. 없으면 추가
- GA 이벤트 발화

### 백엔드

- 변경 없음 (기존 user-interaction API 재사용, idempotency만 검증)
