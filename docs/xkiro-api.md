# xKiro API — verification notes

**Source of truth used:** https://docs.xkiro.com/ (Overview, API Documentation,
and "Any other tool" guide pages), checked at implementation time.

## Confirmed facts

| Item | Finding |
|---|---|
| Base URL | `https://api.xkiro.com/v1` |
| Auth | `Authorization: Bearer <key>` (docs also mention `x-api-key` as an accepted header) |
| Wire format | OpenAI Chat Completions at `POST /v1/chat/completions`, **and** Anthropic Messages at `POST /v1/messages`. xKiro explicitly documents itself as usable via the stock `openai` SDK by just changing `baseURL` and the model id. |
| Model catalog | `GET /v1/models` is documented as **public** (works without a key) and returns the live list of available models. |
| Model id format | `vendor/model`, e.g. `openai/gpt-5.6-sol`, `anthropic/claude-opus-5`, `minimax/minimax-m3`. |
| Streaming | Server-Sent Events. |
| Tool/function calling | Documented ("describe your functions and let the model decide when to call them"), OpenAI-style `tools` / `tool_calls` contract implied by full OpenAI compatibility. |
| Modalities | Text, vision (documents/images), speech (TTS), image generation (async job API) — this app only uses text + tool calling. |

## What this app implements accordingly

- `lib/xkiro.js` uses the official `openai` npm package pointed at
  `https://api.xkiro.com/v1`, exactly as xKiro's own docs recommend.
- `GET /api/models` proxies xKiro's public `GET /v1/models` — the model
  list is **never hardcoded** in this codebase.
- `POST /api/chat` requests `stream: true` and forwards Server-Sent
  Events to the browser as they arrive (see api/chat.js).
- Tool calling is wired using the standard OpenAI `tools` array /
  `tool_calls` delta format.

## Not independently verified

The exact byte-for-byte shape of streaming delta chunks, tool-call
argument accumulation across chunks, and error payload shape for
xKiro specifically were **not** pulled from a full API reference dump
(only the overview/guide pages were reviewed) — this app relies on
xKiro's stated full OpenAI compatibility and the official `openai`
SDK to handle those details, rather than us hand-rolling a parser
against an assumed schema. If xKiro's actual stream/error format
diverges from stock OpenAI in some edge case, `api/chat.js` surfaces
the raw upstream error message (redacted of any key-like strings)
rather than silently producing a fake answer.

## Speech / image generation

xKiro also documents TTS and image-generation endpoints. **This app
does not implement them** — the Plugin system here only covers text
chat + the 7 plugins listed in the spec (web search, music/YouTube,
weather, calculator, world time, GitHub). Adding TTS/image support
would be a new, separately-scoped feature, not something silently
faked under an existing plugin.
