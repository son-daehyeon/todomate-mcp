# todomate-mcp

[투두메이트(todo mate)](https://todomate.net)를 Claude 같은 MCP 클라이언트에서 쓸 수 있게 해 주는 **비공식** MCP 서버입니다.

"오늘 할 일 보여줘", "eCampus 마감들을 투두메이트 학교 카테고리에 넣어줘", "과제 작성 완료 처리해줘" 같은 요청을 Claude가 직접 처리할 수 있습니다.

> 투두메이트 공식 MCP는 카카오 PlayMCP를 통해서만 제공되고, 로컬 클라이언트(Claude Code 등)에서는 OAuth 등록이 IP 제한으로 막혀 있습니다. 이 서버는 투두메이트 웹 앱이 쓰는 것과 같은 Firebase 경로로 직접 동작합니다.

## 할 수 있는 것

| 도구 | 내용 |
|---|---|
| `list_categories` | 카테고리(목표) 목록. `include_finished`로 종료된 카테고리까지 |
| `list_todos` | 기간의 할 일 (기본 오늘, 최대 93일). 카테고리로 거르기 가능 |
| `add_todo` | 할 일 추가 (카테고리, 날짜, 알림 시각) |
| `update_todo` | 완료/미완료, 내용, 날짜 이동, 카테고리 변경, 알림 설정/해제, 메모 |
| `delete_todo` | 할 일 삭제 |

## 설치

Node.js 22 이상과 Google Chrome이 필요합니다.

```bash
git clone git@github.com:son-daehyeon/todomate-mcp.git ~/.local/share/mcp/todomate-mcp
cd ~/.local/share/mcp/todomate-mcp
npm install
```

## 로그인

```bash
node src/index.js login
```

크롬 창이 열리면 평소처럼(구글, 애플, 카카오, 이메일) 투두메이트에 로그인하세요. 로그인이 감지되면 창이 자동으로 닫히고 `~/.config/todomate-mcp/credentials.json`(권한 600)에 로그인 정보가 저장됩니다.

- 비밀번호는 저장하지 않습니다. Firebase 리프레시 토큰만 저장합니다.
- 로그인용 크롬 프로필은 `~/.config/todomate-mcp/chrome-profile`에 따로 만들어지며, 평소 쓰는 크롬과 섞이지 않습니다.
- 크롬이 다른 위치에 있으면 `CHROME_PATH`로 지정하세요.
- 로그인이 만료되면 위 명령을 다시 실행하세요.

## Claude에 연결

**Claude Code**

```bash
claude mcp add todomate --scope user -- node ~/.local/share/mcp/todomate-mcp/src/index.js
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`

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

## 날짜와 시간

- 날짜는 `YYYY-MM-DD`, 알림 시각은 `YYYY-MM-DD HH:mm`(이 컴퓨터의 시간대 기준)입니다.
- 투두메이트는 날짜를 "그 날의 UTC 자정"으로 저장하며, 이 서버도 같은 방식으로 저장합니다.

## 주의

- 투두메이트의 공식 API가 아닙니다. 앱 구조가 바뀌면 동작하지 않을 수 있고, 이용약관상 문제가 될 수 있으니 본인 계정에만 쓰세요.
- 수정·삭제는 본인 할 일(`writerID`가 내 계정)에만 허용됩니다.
- 루틴, 크루, 다이어리, 타이머는 다루지 않습니다.

## 점검

실제 계정으로 조회 후 테스트 할 일을 하나 추가·수정·삭제해 결과를 검사합니다.

```bash
npm run check
```
