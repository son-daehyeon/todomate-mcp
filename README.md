# todomate-mcp

> 투두메이트(todo mate) 비공식 MCP 서버

[투두메이트](https://todomate.net)를 Claude 같은 MCP 클라이언트에서 쓸 수 있게 해 주는 비공식 MCP 서버다. "오늘 할 일 보여줘", "과제 작성 완료 처리해줘" 같은 요청을 클라이언트가 직접 처리한다. 투두메이트 공식 MCP는 카카오 PlayMCP로만 제공되고 로컬 클라이언트에서는 OAuth 등록이 IP 제한으로 막혀 있어서, 웹 앱이 쓰는 것과 같은 Firebase(Firestore REST) 경로로 직접 동작하도록 만들었다.

## 주요 기능
| 도구 | 내용 |
|---|---|
| `list_categories` | 카테고리(목표) 목록. `include_finished`로 종료된 카테고리까지 |
| `list_todos` | 기간의 할 일 (기본 오늘, 최대 93일). 카테고리로 거르기 가능 |
| `add_todo` | 할 일 추가 (카테고리, 날짜, 알림 시각) |
| `update_todo` | 완료/미완료, 내용, 날짜 이동, 카테고리 변경, 알림 설정/해제, 메모 |
| `delete_todo` | 할 일 삭제 |

- 로그인은 별도 프로필로 띄운 크롬 창에서 평소처럼(구글, 애플, 카카오, 이메일) 하고, 감지되면 Firebase 리프레시 토큰만 `~/.config/todomate-mcp/credentials.json`(권한 600)에 저장한다. 비밀번호는 저장하지 않는다
- 날짜는 `YYYY-MM-DD`, 알림 시각은 `YYYY-MM-DD HH:mm`(로컬 시간대)으로 받고, 투두메이트와 같이 날짜를 그 날의 UTC 자정으로 저장한다
- 수정·삭제는 본인이 작성한 할 일에만 허용한다. 루틴, 크루, 다이어리, 타이머는 다루지 않는다
- 공식 API가 아니므로 앱 구조가 바뀌면 동작하지 않을 수 있다. 본인 계정에만 쓴다

## 기술 스택
| 영역 | 기술 |
|---|---|
| 언어 | JavaScript (Node.js 22 이상, ES 모듈) |
| 프레임워크 | @modelcontextprotocol/sdk 1, zod 4 |
| 데이터 | Firebase Auth·Firestore REST API |

## 구조
```
src/index.js      MCP 서버(stdio)와 login 명령 (크롬 원격 디버깅으로 로그인 감지)
src/todomate.js   도구 정의와 할 일·카테고리 처리
src/client.js     토큰 갱신, Firestore REST 호출, 값 변환
src/check.js      실제 계정으로 조회·추가·수정·삭제를 점검하는 스크립트
```

## 실행
```bash
git clone https://github.com/son-daehyeon/todomate-mcp.git ~/.local/share/mcp/todomate-mcp
cd ~/.local/share/mcp/todomate-mcp
npm install
node src/index.js login

# Claude Code에 등록
claude mcp add todomate --scope user -- node ~/.local/share/mcp/todomate-mcp/src/index.js

# 실제 계정으로 점검
npm run check
```
Claude Desktop은 `claude_desktop_config.json`에 등록한다.
```json
{
  "mcpServers": {
    "todomate": {
      "command": "node",
      "args": ["/Users/<you>/.local/share/mcp/todomate-mcp/src/index.js"]
    }
  }
}
```
Google Chrome이 필요하다. 환경 변수: `CHROME_PATH` (크롬 위치가 다를 때), `TODOMATE_CONFIG_DIR` (설정 폴더를 바꿀 때)

---
2026 · 개인 프로젝트 · 사용 중
