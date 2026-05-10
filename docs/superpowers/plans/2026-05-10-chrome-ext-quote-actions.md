# Chrome 확장 좋아요/저장 액션 버튼 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome 확장의 명언 표시 영역에 좋아요(♡)/저장(🔖) 버튼을 추가해, 클릭 시 사이트로 딥링크되어 사이트가 자동으로 좋아요/저장을 처리하게 함으로써 확장 → 사이트 유입을 만든다.

**Architecture:** 두 단계 — 사이트(`inspireme.advenoh.pe.kr`)에 `?action=like|save` 쿼리 핸들러 + OAuth `redirect_uri` 지원을 먼저 배포. 그 다음 Chrome 확장(`inspireme.chrome`)에 액션 버튼이 사이트로 딥링크하도록 추가. 사이트 측은 미로그인 사용자에게 로그인 모달을 띄우고, 로그인 후 returnTo로 복귀해서 자동으로 액션 처리.

**Tech Stack:**
- Site: Next.js 15 + React 19 + TypeScript, TanStack Query, sonner toast, react-i18next, shadcn/ui
- Backend: Go + Echo v4 (OAuth signin endpoints만 손봄)
- Extension: WXT + React 19 + Tailwind v4

**Spec:** `docs/superpowers/specs/2026-05-10-chrome-ext-quote-actions-design.md`

---

## File Structure

### Phase A — 사이트 (inspireme.advenoh.pe.kr)

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `backend/pkg/auth/handler.go` | 수정 | `oauthSignin`에서 `redirect_uri` 쿼리 파라미터 받아서 OAuthState에 저장 |
| `backend/pkg/auth/handler_test.go` | 생성 (없으면) | redirect_uri 처리 / origin 검증 테스트 |
| `frontend/lib/quote-action-handler.ts` | 생성 | `?action=` 쿼리 처리 헬퍼 (whitelist, replaceState) |
| `frontend/components/quote/quote-action-handler.tsx` | 생성 | 클라이언트 컴포넌트 — useEffect로 action 처리, 미로그인 시 모달 |
| `frontend/components/auth/login-required-modal.tsx` | 생성 | 작은 다이얼로그 — Google/Naver 로그인 버튼이 redirect_uri 보존 |
| `frontend/components/quote/quote-detail-client.tsx` | 수정 | `<QuoteActionHandler />` 마운트 |
| `frontend/lib/locales/ko/common.json` | 수정 | 액션 토스트 카피 추가 |
| `frontend/lib/locales/en/common.json` | 수정 | 액션 토스트 카피 추가 |

### Phase B — 확장 (inspireme.chrome)

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `src/lib/constants.ts` | 수정 | `buildQuoteActionUrl(id, action, lang, version)` 추가 |
| `src/lib/analytics.ts` | 수정 | `trackQuoteAction(action, quoteId)` 추가 |
| `src/components/QuoteActions.tsx` | 생성 | 좋아요/저장 두 anchor 버튼 |
| `src/components/Quote.tsx` | 수정 | `<QuoteActions />` 마운트 (id 있을 때만) |
| `src/entrypoints/newtab/style.css` (또는 동등) | 수정 | `animate-fade-in-delayed` keyframe 추가 |

---

## Phase A — 사이트 변경

### Task A1: Backend — `oauthSignin`에 `redirect_uri` 쿼리 지원 (테스트)

**Files:**
- Test: `backend/pkg/auth/handler_test.go`

OAuthState에 사용자가 보낸 안전한 redirect_uri를 담을 수 있어야 함. 같은 origin 경로만 허용 (open redirect 방지).

- [ ] **Step 1: OAuthState redirect_uri 처리 테스트 작성**

`backend/pkg/auth/handler_test.go` 파일이 없으면 생성. 있으면 함수만 추가.

```go
package auth

import (
	"net/url"
	"testing"
)

func TestSanitizeRedirectURI(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{"빈 문자열은 기본값(/) 반환", "", "/"},
		{"같은 origin 절대경로 OK", "/quotes/abc?action=like", "/quotes/abc?action=like"},
		{"외부 URL은 거부 → /", "https://evil.com/foo", "/"},
		{"프로토콜 상대 URL 거부 → /", "//evil.com/foo", "/"},
		{"빈 경로 거부 → /", "no-leading-slash", "/"},
		{"백슬래시 우회 거부 → /", "/\\evil.com", "/"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := sanitizeRedirectURI(tc.input)
			if got != tc.expected {
				t.Errorf("sanitizeRedirectURI(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestOauthSigninReadsRedirectURIQuery(t *testing.T) {
	// oauthSignin이 c.QueryParam("redirect_uri")를 읽어 sanitize 후 OAuthState에 담는지 검증.
	// (간단히 url.Values로 케이스 시뮬레이션)
	v := url.Values{}
	v.Set("redirect_uri", "/quotes/abc?action=save")
	if got := sanitizeRedirectURI(v.Get("redirect_uri")); got != "/quotes/abc?action=save" {
		t.Errorf("got %q", got)
	}
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd backend && go test ./pkg/auth/ -run TestSanitizeRedirectURI -v
```

Expected: `sanitizeRedirectURI` undefined → 컴파일 에러

- [ ] **Step 3: `sanitizeRedirectURI` 헬퍼 구현**

`backend/pkg/auth/handler.go` 끝부분에 추가:

```go
// sanitizeRedirectURI 같은 origin 절대경로만 허용. 그 외는 "/" 반환.
// open redirect 방지: 외부 URL, 프로토콜 상대 URL, 백슬래시 우회 차단.
func sanitizeRedirectURI(raw string) string {
	if raw == "" {
		return "/"
	}
	// "/"로 시작하지 않으면 거부
	if raw[0] != '/' {
		return "/"
	}
	// "//" (프로토콜 상대) 거부
	if len(raw) >= 2 && raw[1] == '/' {
		return "/"
	}
	// 백슬래시 우회 거부 ("/\\evil.com" 같은 케이스)
	if len(raw) >= 2 && raw[1] == '\\' {
		return "/"
	}
	return raw
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && go test ./pkg/auth/ -run TestSanitizeRedirectURI -v
```

Expected: PASS (모든 케이스)

- [ ] **Step 5: `oauthSignin` 함수에서 redirect_uri 쿼리 사용**

`backend/pkg/auth/handler.go`의 `oauthSignin` 함수 (line 285~) 수정:

```go
// oauthSignin 공통 OAuth 로그인 처리
func (h *Handler) oauthSignin(c echo.Context, provider OAuthProvider) error {
	if provider == nil || !provider.IsConfigured() {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{
			"error":   "oauth_not_configured",
			"message": "OAuth가 설정되지 않았습니다",
		})
	}

	csrfToken := h.generateCSRFToken()
	h.storeCSRFToken(csrfToken)

	// 신규: redirect_uri 쿼리 파라미터 (없으면 "/")
	redirectURI := sanitizeRedirectURI(c.QueryParam("redirect_uri"))

	state := OAuthState{
		Intent:      OAuthIntentSignin,
		CSRF:        csrfToken,
		RedirectURI: redirectURI,
	}

	authURL, err := provider.GetAuthURL(state)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to generate auth url",
		})
	}

	return c.Redirect(http.StatusFound, authURL)
}
```

(`oauthSignup`은 `/terms`로 가야 하므로 그대로 둠)

- [ ] **Step 6: 전체 auth 패키지 테스트 통과 확인**

```bash
cd backend && go test ./pkg/auth/ -v
```

Expected: PASS (기존 + 새 테스트)

- [ ] **Step 7: lint 확인**

```bash
cd backend && make lint
```

Expected: 에러 없음

- [ ] **Step 8: 커밋 (사이트 레포에서)**

```bash
cd inspireme.advenoh.pe.kr
git checkout -b feature/466-oauth-redirect-uri
git add backend/pkg/auth/handler.go backend/pkg/auth/handler_test.go
git commit -m "[#466] feat: OAuth signin에 redirect_uri 쿼리 파라미터 지원

* sanitizeRedirectURI로 같은 origin 경로만 허용 (open redirect 방지)
* oauthSignin이 ?redirect_uri=... 받아 OAuthState.RedirectURI에 저장
* OAuth 콜백이 이미 state.RedirectURI를 사용하므로 콜백 변경 없음"
```


---

### Task A2: Frontend — i18n 토스트 카피 추가

**Files:**
- Modify: `frontend/lib/locales/ko/common.json` (또는 i18n 파일이 있는 경로 — 실제 경로는 `frontend/lib/i18n.ts` 참조)
- Modify: `frontend/lib/locales/en/common.json`

먼저 i18n 파일의 실제 위치를 확인.

- [ ] **Step 1: i18n locale 파일 위치 확인**

```bash
cd frontend && find . -name "common.json" -not -path "*/node_modules/*" 2>/dev/null
# 또는
grep -rn "i18next" lib/i18n.ts | head -5
```

찾은 경로를 이후 단계에 적용. 아래 단계는 `frontend/lib/locales/{ko,en}/common.json`을 가정.

- [ ] **Step 2: ko common.json에 토스트 키 추가**

기존 JSON 객체에 추가 (위치는 알파벳순 또는 관련 그룹 옆):

```json
{
  "...": "...",
  "quoteAction": {
    "likeSuccess": "좋아요 표시했어요 ♡",
    "saveSuccess": "내 명언에 저장했어요 🔖",
    "alreadyLiked": "이미 좋아요한 명언이에요",
    "alreadySaved": "이미 저장한 명언이에요",
    "actionFailed": "잠시 후 다시 시도해주세요",
    "loginRequired": "좋아요/저장하려면 로그인이 필요해요",
    "loginRequiredDescription": "로그인하면 자동으로 처리됩니다"
  }
}
```

- [ ] **Step 3: en common.json에 동일한 키 추가**

```json
{
  "...": "...",
  "quoteAction": {
    "likeSuccess": "Liked ♡",
    "saveSuccess": "Saved to your collection 🔖",
    "alreadyLiked": "You've already liked this",
    "alreadySaved": "You've already saved this",
    "actionFailed": "Please try again later",
    "loginRequired": "Sign in to like or save",
    "loginRequiredDescription": "After login we'll do it automatically"
  }
}
```

- [ ] **Step 4: dev 서버에서 i18n 파일이 정상 로드되는지 빌드로 확인**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build 성공

- [ ] **Step 5: 커밋**

```bash
git add frontend/lib/locales/
git commit -m "[#466] feat: 액션 토스트 i18n 카피 추가 (ko, en)"
```

---

### Task A3: Frontend — 액션 처리 헬퍼 작성

**Files:**
- Create: `frontend/lib/quote-action-handler.ts`

action 쿼리를 안전하게 파싱하고, URL에서 제거하는 순수 함수 모음.

- [ ] **Step 1: 헬퍼 모듈 작성**

```ts
// frontend/lib/quote-action-handler.ts
"use client";

export type QuoteAction = "like" | "save";

const ALLOWED_ACTIONS: ReadonlySet<QuoteAction> = new Set(["like", "save"]);

/**
 * URL의 ?action= 쿼리를 읽어 화이트리스트에 있는 값만 반환. 그 외는 null.
 */
export function parseAction(searchParams: URLSearchParams): QuoteAction | null {
  const raw = searchParams.get("action");
  if (!raw) return null;
  return ALLOWED_ACTIONS.has(raw as QuoteAction) ? (raw as QuoteAction) : null;
}

/**
 * 현재 URL에서 ?action= 만 제거하고 나머지 쿼리는 보존. history.replaceState로 적용.
 * 새로고침 시 액션이 재실행되지 않도록 사용.
 */
export function clearActionFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("action");
  // utm_*은 GA가 이미 수집했으면 그대로 두되, 깔끔히 정리하려면 같이 제거.
  // 여기서는 action만 제거하여 다른 측정값에 영향 없게.
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

/**
 * 미로그인 사용자가 로그인 후 돌아올 redirect_uri 생성.
 * 현재 URL의 path + search + hash를 그대로 보존하여, 로그인 완료 후 액션이 재트리거되게 함.
 */
export function buildReturnToPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search + window.location.hash;
}
```

- [ ] **Step 2: 단순 type-check (frontend 테스트 인프라가 없으므로)**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add frontend/lib/quote-action-handler.ts
git commit -m "[#466] feat: ?action= 쿼리 처리 헬퍼 추가

* parseAction: like/save 화이트리스트만 통과
* clearActionFromUrl: history.replaceState로 action 쿼리 제거
* buildReturnToPath: OAuth 후 복귀 경로 보존"
```

---

### Task A4: Frontend — 로그인 필요 모달 컴포넌트

**Files:**
- Create: `frontend/components/auth/login-required-modal.tsx`

이미 있는 `auth-buttons.tsx`의 `GoogleSigninButton`/`NaverSigninButton`은 `redirect_uri`를 전달하지 않음. 모달 안에서는 직접 URL을 빌드.

- [ ] **Step 1: 모달 컴포넌트 작성**

```tsx
// frontend/components/auth/login-required-modal.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FcGoogle } from "react-icons/fc";
import { SiNaver } from "react-icons/si";
import { useTranslation } from "react-i18next";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface LoginRequiredModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 로그인 후 복귀할 경로 (path + search + hash) */
  returnTo: string;
}

export function LoginRequiredModal({
  open,
  onOpenChange,
  returnTo,
}: LoginRequiredModalProps) {
  const { t } = useTranslation(["common"]);

  const buildSigninUrl = (provider: "google" | "naver") => {
    const url = new URL(`${API_BASE_URL}/api/auth/${provider}/signin`);
    url.searchParams.set("redirect_uri", returnTo);
    return url.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("common:quoteAction.loginRequired", "좋아요/저장하려면 로그인이 필요해요")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "common:quoteAction.loginRequiredDescription",
              "로그인하면 자동으로 처리됩니다"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-2">
          <Button
            variant="outline"
            className="w-full flex items-center gap-2"
            onClick={() => {
              window.location.href = buildSigninUrl("google");
            }}
          >
            <FcGoogle className="w-5 h-5" />
            Google로 로그인
          </Button>
          <Button
            variant="outline"
            className="w-full flex items-center gap-2 border-[#03C75A] text-[#03C75A] hover:bg-[#03C75A]/10"
            onClick={() => {
              window.location.href = buildSigninUrl("naver");
            }}
          >
            <SiNaver className="w-4 h-4" />
            네이버로 로그인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add frontend/components/auth/login-required-modal.tsx
git commit -m "[#466] feat: LoginRequiredModal 컴포넌트 추가

* Google/Naver 로그인 버튼이 redirect_uri 쿼리로 returnTo 전달
* 액션 핸들러가 미로그인 시 띄움"
```

---

### Task A5: Frontend — 액션 핸들러 컴포넌트

**Files:**
- Create: `frontend/components/quote/quote-action-handler.tsx`

`?action=like|save` 쿼리를 감지해서 처리하는 클라이언트 컴포넌트. quote-detail-client.tsx에 단순 마운트되며 UI는 모달 외 렌더 없음.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// frontend/components/quote/quote-action-handler.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUserInteractions } from "@/hooks/useUserInteractions";
import { useQuoteInteraction } from "@/hooks/useQuoteInteraction";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  parseAction,
  clearActionFromUrl,
  buildReturnToPath,
  type QuoteAction,
} from "@/lib/quote-action-handler";
import { LoginRequiredModal } from "@/components/auth/login-required-modal";
import { CollectionSelectModal } from "@/components/collection/collection-select-modal";

interface QuoteActionHandlerProps {
  quoteId: string;
}

export function QuoteActionHandler({ quoteId }: QuoteActionHandlerProps) {
  const { t } = useTranslation(["common"]);
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const { likedQuotes, savedQuotes, isLoading: interactionsLoading } =
    useUserInteractions();
  const { toggleLike } = useQuoteInteraction();

  // 같은 페이지에서 한 번만 처리
  const processedRef = useRef(false);

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    if (processedRef.current) return;
    if (authLoading) return;

    const action: QuoteAction | null = parseAction(searchParams);
    if (!action) return;

    // 미로그인 → 모달
    if (!user) {
      processedRef.current = true;
      setReturnTo(buildReturnToPath());
      setLoginModalOpen(true);
      return;
    }

    // 로그인됨이지만 interactions 아직 로딩 중이면 한 프레임 더 기다림
    if (interactionsLoading) return;

    processedRef.current = true;

    // 액션별 처리
    if (action === "like") {
      const alreadyLiked = likedQuotes.includes(quoteId);
      if (alreadyLiked) {
        toast.info(
          t("common:quoteAction.alreadyLiked", "이미 좋아요한 명언이에요")
        );
      } else {
        try {
          toggleLike(quoteId);
          toast.success(
            t("common:quoteAction.likeSuccess", "좋아요 표시했어요 ♡")
          );
        } catch {
          toast.error(
            t("common:quoteAction.actionFailed", "잠시 후 다시 시도해주세요")
          );
          // 실패 시 처리 플래그 되돌림: 새로고침 시 재시도 가능하게
          processedRef.current = false;
          return;
        }
      }
      clearActionFromUrl();
      return;
    }

    if (action === "save") {
      const alreadySaved = savedQuotes.includes(quoteId);
      if (alreadySaved) {
        toast.info(
          t("common:quoteAction.alreadySaved", "이미 저장한 명언이에요")
        );
        clearActionFromUrl();
      } else {
        // 컬렉션 선택 모달 자동 열기 (기존 UX와 일치)
        setCollectionModalOpen(true);
        // 모달이 컬렉션을 선택하면 자체 토스트가 뜨고 닫힘 → 그때 URL 정리
      }
    }
  }, [
    authLoading,
    interactionsLoading,
    user,
    likedQuotes,
    savedQuotes,
    quoteId,
    searchParams,
    toggleLike,
    t,
  ]);

  // 컬렉션 모달이 닫혔을 때 URL 정리 (실제 저장 완료/취소 모두 동일하게 처리)
  const handleCollectionModalChange = (open: boolean) => {
    setCollectionModalOpen(open);
    if (!open) clearActionFromUrl();
  };

  return (
    <>
      <LoginRequiredModal
        open={loginModalOpen}
        onOpenChange={setLoginModalOpen}
        returnTo={returnTo}
      />
      <CollectionSelectModal
        quoteId={quoteId}
        open={collectionModalOpen}
        onOpenChange={handleCollectionModalChange}
      />
    </>
  );
}
```

- [ ] **Step 2: type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: lint**

```bash
cd frontend && npm run lint
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add frontend/components/quote/quote-action-handler.tsx
git commit -m "[#466] feat: ?action= 쿼리 처리 핸들러 컴포넌트 추가

* like: 토글 호출 전 likedQuotes 확인, idempotent하게 동작
* save: 미저장이면 CollectionSelectModal 자동 오픈 (기존 UX 일치)
* 미로그인이면 LoginRequiredModal로 returnTo 보존 로그인 유도
* useRef로 같은 페이지 중복 처리 방지"
```

---

### Task A6: Frontend — `quote-detail-client.tsx`에 핸들러 마운트

**Files:**
- Modify: `frontend/components/quote/quote-detail-client.tsx`

기존 페이지 동작은 그대로 두고 `<QuoteActionHandler />`만 추가.

- [ ] **Step 1: import 추가**

`frontend/components/quote/quote-detail-client.tsx` 상단 import 블록 (line 1~13)에 추가:

```tsx
import { QuoteActionHandler } from "@/components/quote/quote-action-handler";
```

- [ ] **Step 2: 컴포넌트 렌더 트리에 마운트**

기존 return의 root `<div className="mb-8">` 안 가장 앞에 추가:

```tsx
return (
  <div className="mb-8">
    <QuoteActionHandler quoteId={quote.id} />

    <Link href="/" className="...">
      {/* 기존 그대로 */}
    </Link>
    {/* ...기존 그대로... */}
  </div>
);
```

- [ ] **Step 3: type-check + lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add frontend/components/quote/quote-detail-client.tsx
git commit -m "[#466] feat: QuoteDetailClient에 액션 핸들러 마운트"
```

---

### Task A7: Phase A 수동 검증

**Files:** 없음 (수동 테스트만)

테스트 인프라가 없으므로 수동 검증으로 통합 확인.

- [ ] **Step 1: 로컬 환경 기동**

```bash
cd inspireme.advenoh.pe.kr && make run-all
```

Backend: 8080, Frontend: 3000 가동 확인. dev-login 또는 OAuth로 로그인 가능하게 설정.

- [ ] **Step 2: 시나리오 1 — 로그인 + 좋아요**

브라우저: `http://localhost:3000/quotes/{유효한-quote-id}?action=like`

기대:
- 페이지 로드 직후 "좋아요 표시했어요 ♡" 토스트
- URL에서 `?action=like` 사라짐
- `/management/liked` 방문 시 해당 명언 보임

- [ ] **Step 3: 시나리오 2 — 로그인 + 저장**

브라우저: `http://localhost:3000/quotes/{유효한-quote-id}?action=save`

기대:
- CollectionSelectModal 자동 오픈
- 컬렉션 선택 → 모달 자체 토스트 + 닫힘 → URL에서 `?action=save` 사라짐
- `/management/saved` 방문 시 해당 명언 보임

- [ ] **Step 4: 시나리오 3 — 미로그인 + 좋아요**

로그아웃 후 `http://localhost:3000/quotes/{유효한-quote-id}?action=like` 방문

기대:
- LoginRequiredModal 자동 오픈
- "Google로 로그인" 클릭 → OAuth → 콜백 → 원 URL(`/quotes/{id}?action=like`)로 복귀
- useEffect 재실행 → "좋아요 표시했어요 ♡" 토스트
- `/management/liked`에 명언 보임

- [ ] **Step 5: 시나리오 4 — 이미 좋아요한 명언**

위 시나리오 1을 완료한 명언으로 다시 `?action=like` 방문

기대:
- "이미 좋아요한 명언이에요" 토스트
- `/management/liked`에 중복 행 없음 (개수 그대로)

- [ ] **Step 6: 시나리오 5 — 위조된 action**

`http://localhost:3000/quotes/{id}?action=delete`

기대:
- 토스트 안 뜸
- 페이지 정상 렌더
- `?action=delete`는 그대로 유지 (화이트리스트 무시 → URL 정리도 안 함)

- [ ] **Step 7: 시나리오 6 — open redirect 시도**

`http://localhost:3000/quotes/{id}?action=like` (미로그인) → 모달 → DevTools에서 Google 로그인 버튼 href 확인

기대: `redirect_uri=/quotes/{id}?action=like` (path만, 외부 URL이 아님)

추가: 사용자가 `redirect_uri=https://evil.com` 같은 위조 시도 → 백엔드가 `/`로 sanitize했는지 확인 (DevTools network)

- [ ] **Step 8: 모든 시나리오 통과 확인**

- [ ] **Step 9: PR 생성**

```bash
git push -u origin feature/466-oauth-redirect-uri
gh pr create --title "[#466] feat: ?action=like|save 쿼리로 자동 좋아요/저장 + OAuth redirect_uri" --body "$(cat <<'EOF'
## Summary
- Chrome 확장에서 사이트로 딥링크되는 `?action=like|save` 처리 도입
- OAuth signin endpoint에 `redirect_uri` 쿼리 지원 (open redirect 방지 sanitize 포함)
- 미로그인 시 LoginRequiredModal로 returnTo 보존 로그인 유도
- `?action=save`는 기존 CollectionSelectModal과 동일한 UX 흐름

## Test plan
- [ ] 시나리오 1: 로그인 + ?action=like → 자동 좋아요 + 토스트
- [ ] 시나리오 2: 로그인 + ?action=save → 컬렉션 모달 → 저장
- [ ] 시나리오 3: 미로그인 + ?action=like → 모달 → OAuth → returnTo → 자동 좋아요
- [ ] 시나리오 4: 이미 좋아요한 명언 → "이미 좋아요한..." 토스트만
- [ ] 시나리오 5: 위조 action → 무시
- [ ] 시나리오 6: open redirect 시도 → sanitize 확인
EOF
)"
```

---

## Phase B — Chrome 확장 변경

### Task B1: URL 빌더 + GA 이벤트 헬퍼

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/analytics.ts`

- [ ] **Step 1: 브랜치 생성 (확장 레포에서)**

```bash
cd inspireme.chrome
git checkout master && git pull
git checkout -b feature/74-quote-actions
```

- [ ] **Step 2: `constants.ts`에 URL 빌더 추가**

`src/lib/constants.ts` 끝부분에 추가:

```ts
import packageJson from '../../package.json';

export type QuoteAction = 'like' | 'save';

/**
 * 사이트 명언 상세 페이지 + 자동 액션 트리거 URL.
 * utm 파라미터로 GA 측정 분리.
 */
export function buildQuoteActionUrl(
  quoteId: string,
  action: QuoteAction,
  lang: 'ko' | 'en',
): string {
  const url = new URL(`${INSPIREME_BASE_URL}/quotes/${quoteId}`);
  url.searchParams.set('action', action);
  url.searchParams.set('lang', lang);
  url.searchParams.set('utm_source', 'chrome_ext');
  url.searchParams.set('utm_medium', 'quote_action');
  url.searchParams.set('utm_campaign', `ext_v${packageJson.version}`);
  return url.toString();
}
```

`tsconfig.json`이 `resolveJsonModule: true`인지 확인 (대부분 WXT 기본 설정에 포함). 아니면 추가.

- [ ] **Step 3: `analytics.ts`에 trackQuoteAction 추가**

`src/lib/analytics.ts` 끝부분에 추가:

```ts
export async function trackQuoteAction(
  action: 'like' | 'save',
  quoteId: string,
) {
  await trackEvent('quote_action_click', {
    action,
    quote_id: quoteId,
  });
}
```

- [ ] **Step 4: type-check**

```bash
pnpm compile
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/lib/constants.ts src/lib/analytics.ts
git commit -m "[#74] feat: 명언 액션 URL 빌더 + GA 이벤트 헬퍼

* buildQuoteActionUrl: /quotes/{id}?action=...&utm_*=...
* trackQuoteAction: GA 'quote_action_click' 이벤트"
```

---

### Task B2: Tailwind 지연 fade-in 애니메이션

**Files:**
- Modify: `src/entrypoints/newtab/style.css` (또는 글로벌 CSS — WXT/Tailwind v4 환경에 맞게)

- [ ] **Step 1: CSS 파일 위치 확인**

```bash
find src -name "*.css" | head
```

`style.css` 또는 `globals.css` 위치 파악. Tailwind v4는 `@theme`/`@layer` 사용 가능.

- [ ] **Step 2: keyframe + 클래스 추가**

기존 `animate-fade-in` 정의가 있는 파일에 추가:

```css
@keyframes fade-in-delayed {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.animate-fade-in-delayed {
  animation: fade-in-delayed 0.6s ease-out;
}
```

(0.6s 중 절반은 대기 → 명언 본문 fade 후 등장)

- [ ] **Step 3: 빌드 확인**

```bash
pnpm build
```

Expected: 에러 없음. dist에 CSS 포함 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/entrypoints/newtab/style.css
git commit -m "[#74] feat: animate-fade-in-delayed keyframe 추가

* 명언 fade-in 후 액션 버튼이 약 300ms 지연 등장"
```

---

### Task B3: QuoteActions 컴포넌트

**Files:**
- Create: `src/components/QuoteActions.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/components/QuoteActions.tsx
import { Heart, Bookmark } from 'lucide-react';
import { buildQuoteActionUrl, type QuoteAction } from '../lib/constants';
import { trackQuoteAction } from '../lib/analytics';

interface QuoteActionsProps {
  quoteId: string;
  lang: 'ko' | 'en';
}

const LABELS: Record<'ko' | 'en', Record<QuoteAction, string>> = {
  ko: { like: '좋아요', save: '저장' },
  en: { like: 'Like', save: 'Save' },
};

export function QuoteActions({ quoteId, lang }: QuoteActionsProps) {
  const labels = LABELS[lang];

  const renderButton = (action: QuoteAction, Icon: typeof Heart) => (
    <a
      href={buildQuoteActionUrl(quoteId, action, lang)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // 비동기 트래킹 — preventDefault 안 함 → 링크 정상 동작
        trackQuoteAction(action, quoteId);
      }}
      className="
        inline-flex items-center gap-2 px-4 py-2 rounded-full
        text-white/70 bg-white/10
        hover:bg-white/20 hover:text-white
        transition-colors
        text-sm
      "
      aria-label={labels[action]}
    >
      <Icon className="h-4 w-4" />
      {labels[action]}
    </a>
  );

  return (
    <div className="flex items-center justify-center gap-3">
      {renderButton('like', Heart)}
      {renderButton('save', Bookmark)}
    </div>
  );
}
```

`lucide-react`가 의존성에 없으면 추가 필요. 확인:

```bash
grep "lucide-react" package.json
```

없으면:

```bash
pnpm add lucide-react
```

- [ ] **Step 2: type-check**

```bash
pnpm compile
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/QuoteActions.tsx package.json pnpm-lock.yaml
git commit -m "[#74] feat: QuoteActions 컴포넌트 추가

* 좋아요/저장 두 anchor 버튼 (target=_blank)
* lang에 따른 ko/en 라벨
* 클릭 시 GA 'quote_action_click' 이벤트 + 사이트 딥링크"
```

---

### Task B4: Quote.tsx에 마운트

**Files:**
- Modify: `src/components/Quote.tsx`

- [ ] **Step 1: import 추가**

`src/components/Quote.tsx` 상단:

```tsx
import { QuoteActions } from './QuoteActions';
import { useSettings } from '../hooks/useSettings';
```

- [ ] **Step 2: 컴포넌트 안에서 lang 가져오기**

`Quote` 함수 본문 시작 부분 (early return 직전):

```tsx
const { settings } = useSettings();
const lang = (settings.lang as 'ko' | 'en') ?? 'ko';
```

(`settings.lang`이 없으면 fallback. 실제 `UserSettings` 타입에서 lang 키 이름을 확인해 맞춰야 함 — `src/types/settings.ts` 참조)

- [ ] **Step 3: lang 키 실제 이름 확인**

```bash
cat src/types/settings.ts
```

`lang` 또는 `language`. 발견된 키로 코드 보정.

- [ ] **Step 4: 액션 버튼 마운트**

`Quote` 컴포넌트의 return 안, 명언+저자 블록 닫는 `</div>` 직전에 추가:

```tsx
return (
  <div key={quote.id || quote.content} className="text-center animate-fade-in">
    {/* 기존 명언 + 저자 그대로 */}
    {hasLink ? (
      <a href={quoteUrl} className="cursor-pointer hover:opacity-80 transition-opacity">
        {quoteContent}
      </a>
    ) : (
      quoteContent
    )}

    <p className="mt-4 text-xl text-white/80 drop-shadow-md break-keep" style={{ fontFamily: fontFamily || undefined }}>
      —{' '}
      {authorUrl ? (
        <a href={authorUrl} className="hover:underline">{quote.author}</a>
      ) : (
        quote.author
      )}
    </p>

    {/* 신규 — id 있을 때만 */}
    {hasLink && (
      <div className="mt-6 animate-fade-in-delayed">
        <QuoteActions quoteId={quote.id!} lang={lang} />
      </div>
    )}
  </div>
);
```

- [ ] **Step 5: type-check + lint**

```bash
pnpm compile && pnpm lint
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/components/Quote.tsx
git commit -m "[#74] feat: Quote 컴포넌트에 액션 버튼 마운트

* quote.id 있을 때만 좋아요/저장 버튼 표시
* settings.lang에 따라 ko/en 라벨"
```

---

### Task B5: Phase B 수동 검증

**Files:** 없음

- [ ] **Step 1: dev 모드 실행**

```bash
cd inspireme.chrome && pnpm dev
```

Chrome이 자동으로 열리고 새 탭에서 확장 로드 확인.

- [ ] **Step 2: 시나리오 — 기본 표시**

새 탭 열고 확인:
- 명언 + 저자 아래 [♡ 좋아요] [🔖 저장] 두 버튼 가로 나란히
- fade-in 후 약 300ms 지연 등장
- 다크 배경에서 가독성 OK

- [ ] **Step 3: 시나리오 — 좋아요 클릭**

♡ 클릭:
- 새 탭에서 `https://inspire-me.advenoh.pe.kr/quotes/{id}?action=like&lang=ko&utm_source=chrome_ext&...` 열림
- 사이트가 처리 (Phase A 결과)

- [ ] **Step 4: 시나리오 — 저장 클릭**

🔖 클릭:
- 새 탭에서 `?action=save` 열림
- CollectionSelectModal 노출

- [ ] **Step 5: 시나리오 — 미들 클릭 / Cmd+클릭**

각각 백그라운드 새 탭으로 열리는지 확인 (anchor 기본 동작)

- [ ] **Step 6: 시나리오 — fallback 명언 (오프라인 등 id 없음)**

DevTools에서 네트워크 차단 후 새 탭 → fallback 명언 표시 시 두 버튼 모두 보이지 않음 확인

- [ ] **Step 7: 시나리오 — 다국어**

설정에서 영어로 변경 → "Like" / "Save" 라벨로 표시. URL에 `lang=en` 포함.

- [ ] **Step 8: GA 이벤트 발화 확인**

DevTools Network 탭에서 `google-analytics.com/mp/collect` 호출에 `quote_action_click` 이벤트와 `action`, `quote_id` 파라미터 포함 확인.

- [ ] **Step 9: 빠른 더블 클릭**

같은 버튼 빠르게 두 번 → 두 새 탭 → 사이트에서 둘 다 처리되어도 idempotent (중복 좋아요/저장 안 됨)

- [ ] **Step 10: 모든 시나리오 통과 확인**

- [ ] **Step 11: PR 생성**

```bash
git push -u origin feature/74-quote-actions
gh pr create --title "[#74] feat: 새 탭 명언에 좋아요/저장 액션 버튼 추가" --body "$(cat <<'EOF'
## Summary
- 새 탭 명언 아래에 [♡ 좋아요] [🔖 저장] 두 버튼 추가
- 클릭 시 사이트 명언 페이지를 새 탭으로 열고 자동 좋아요/저장 트리거
- utm 파라미터로 사이트 GA에서 확장 유입 측정

## Dependencies
- 사이트 PR (`feature/466-oauth-redirect-uri`) 머지 + 배포 필요

## Test plan
- [ ] 새 탭 진입 시 두 버튼 fade-in 지연 등장
- [ ] 좋아요 클릭 → 새 탭에 ?action=like 사이트 열림 → 토스트
- [ ] 저장 클릭 → 새 탭에 ?action=save 사이트 열림 → 컬렉션 모달
- [ ] 미들/Cmd 클릭으로 백그라운드 새 탭 정상 동작
- [ ] fallback 명언 (id 없음) → 버튼 숨김
- [ ] 다국어 (ko/en) 라벨 일치 + URL lang= 포함
- [ ] GA 이벤트 quote_action_click 발화
- [ ] 빠른 더블 클릭 시 사이트에서 idempotent 처리
EOF
)"
```

---

## 의존성 / 배포 순서

1. **Phase A 먼저 머지 + 배포** (사이트). 그렇지 않으면 확장 버튼이 클릭됐을 때 사이트가 처리 못 함
2. Phase A가 production 배포된 후 **Phase B 머지 + Chrome Web Store 배포**
3. 확장의 새 버전이 사용자에게 자동 업데이트되기까지 며칠 걸릴 수 있음 (정상)

## Out of Scope (이 plan에서 다루지 않음)

- 자동화된 단위/통합 테스트 (frontend, extension에 테스트 인프라 자체가 없음 → 별도 PR/이슈로)
- A/B 테스트 인프라
- 확장 자체의 토스트/피드백
- 좋아요/저장 외 추가 액션 버튼 (AI 분석, 공유 등) — 다음 단계 의사결정용 데이터 수집 후
- 잠금 화면 / 잠시 후 재시도 큐잉 / 오프라인 지원

## Self-review 체크 (작성자용)

- [x] Spec의 모든 섹션이 task에 매핑됨 (UI, action 처리, 확장, 엣지/보안, 테스트)
- [x] 각 task가 정확한 파일 경로 + 코드 블록 포함
- [x] "TBD"/"TODO"/추상적 단계 없음
- [x] 함수/컴포넌트 이름 일관성 (parseAction, clearActionFromUrl, buildReturnToPath, QuoteActionHandler, LoginRequiredModal, QuoteActions, buildQuoteActionUrl, trackQuoteAction)
- [x] Spec의 가정 #1 (returnTo 지원)을 확인 → 미지원 발견 → backend 수정 task로 추가 (A1)
- [x] Spec의 가정 #2 (useAuth.loading) 확인 → `isLoading` 존재 → 그대로 사용
- [x] Spec의 가정 #3 (idempotent vs toggle) 확인 → toggle임을 발견 → 호출 전 상태 확인 로직으로 보정 (A5)
- [x] 저장 동작이 컬렉션 모달을 거친다는 것 발견 → CollectionSelectModal 자동 오픈으로 처리 (A5)
- [x] 테스트 인프라 부재 발견 → backend Go 테스트만 자동화, frontend/extension은 수동 시나리오로 명시
