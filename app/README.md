This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Opt-in private master chat

`POST /api/chat/master` provides one read-only turn through the personal-agent
master. The existing assistant UI and `/api/chat` still use their current
Claude/Ollama paths. This route does not persist chat history or execute actions.

The LifeOS server reads `LIFEOS_MASTER_ENABLED=1`, `LIFEOS_MASTER_URL` (an explicit
private base URL), and `LIFEOS_MASTER_CLIENT_SECRET` (the provisioned credential
for client `lifeos`). These are server settings, never `NEXT_PUBLIC_*` values.
The homelab deployment uses `http://host.docker.internal:8080` through the
existing Docker host-gateway mapping.

Send `{requestId, sessionId, message, pageContext?}`. Generate the request ID once
per turn and retain the entire payload on a transport retry. IDs allow letters,
numbers, `.`, `_`, `:`, and `-`, up to 128 characters. Messages must be nonblank
and at most 20,000 characters. The JSON body is capped at 32 KiB. Optional
`pageContext` accepts only `{path, title?, summary?}` with limits of 256, 200 and
4,000 characters respectively; omit it when absent. Identity, prompts, grants,
capability hints, actions and specialist selection are rejected as input fields.

The client injects `user_id: local`, `client_id: lifeos`,
`interface: lifeos.assistant`, `mode: sync`, and an empty capability hint list.
Credentials travel only in server-to-master headers. Returned actions, job
states and `needs_action` are rejected. HTTP 200 with master `status: failed`
becomes a typed failure, not an assistant answer. Responses use `no-store`.

Transport failure can trigger one retry with an identical envelope, with a
15-second timeout per attempt. Terminal HTTP/body failures are not automatically
retried. Reusing a request ID with a changed payload produces an idempotency
conflict. Master sync deduplication is process-local; browser cancellation does
not prove the upstream provider stopped. A deliberate new attempt after a known
terminal failure needs a new request ID.

Run local tests without a master or database:

```sh
npx vitest run src/lib/master-client.test.ts src/lib/claude-cli.test.ts src/app/api/chat/master/route.test.ts src/app/api/chat/master/route.integration.test.ts src/app/api/chat/route.regression.test.ts
npx tsc --noEmit --incremental false
npx eslint src/lib/master-client.ts src/lib/master-client.test.ts src/app/api/chat/master/route.ts src/app/api/chat/master/route.test.ts src/app/api/chat/master/route.integration.test.ts src/app/api/chat/route.regression.test.ts
```

The master deployment is private and read-only for this route; provider CLI
confinement remains a deployment limitation. Full history and session memory,
streaming, jobs UX, governed actions and page-local specialist routing remain
later phases. See the personal-agent repository's
`docs/lifeos-integration.md` and `reports/lifeos-integration-report.md` for the
cross-repository contract and verification record.
