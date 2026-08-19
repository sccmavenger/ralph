<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## MSF API patterns

- Always paginate collection endpoints. In particular, omitting `perPage` from
  `/game/v1/characters` asks the MSF API to return the full catalog and will
  eventually trigger its HTTP 472 `RESPONSE_TOO_LARGE` limit as the catalog
  grows.
