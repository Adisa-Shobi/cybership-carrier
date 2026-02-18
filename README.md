# Cybership Carrier

A shipping carrier integration service that wraps carrier APIs behind a unified, carrier-agnostic interface. Currently integrates with UPS Rating API, designed to extend to additional carriers and operations.

## Design Decisions

**Generic operation interface.** Each carrier operation implements `ICarrierOperation<TInput, TOutput>` independently. A monolithic carrier class would grow overly complex and increase single point of failure likelihood. To keep operations small and testable they are isolated.

**UPS types never leave the adapter folder.** Raw UPS API shapes live in `src/carriers/ups/ups.types.ts` and are only imported within that folder. The rest of the system works with domain types. This abstraction makes the service extensible and interchangeable in the case of a version change.

**Zod at system boundaries.** Incoming requests are validated before any HTTP call, and carrier responses are validated before entering the domain layer. Invalid data fails fast with a structured `ValidationError`.

**Auth is transparent.** Token acquisition, caching (with a 60s expiry buffer), and refresh all happen behind `ICarrierAuth.accessToken()`. `HttpClient` retries once on 401 after clearing the cached token. Callers never think about tokens or authentication.

### Adding a new carrier

1. Create `src/carriers/fedex/` with auth client, mapper, types, and operation ensuring the appropriate classes inherit from `ICarrierAuth` and `ICarrierOperation`
2. Register it under a new key (e.g. `fedex:rating`). Only additions are required, no chnges

### Adding a new UPS operation

1. Define UPS-specific types in `ups.types.ts`
2. Create a mapper and operation class
3. Register under a new key (e.g. `ups:label`) in `register.ts`

## Project Structure

```
src/
├── core/           # Domain types, interfaces, errors
├── carriers/ups/   # All UPS-specific code
├── infra/          # Authenticated HTTP client
├── registry/       # Operation registry
└── config.ts       # Env var loading with Zod
tests/
├── fixtures/       # Realistic UPS API payloads
├── ups-auth.test.ts
└── ups-rating.test.ts
```

## Setup

```bash
pnpm install
cp .envrc.example .envrc && direnv allow
```

## Running

```bash
pnpm test
pnpm typecheck
pnpm lint        # biome linter + formatter
pnpm build
```

## Future Improvements

- **Response caching** — cache rate quotes by request hash with a short TTL to avoid burning API quotas on repeated lookups
- **Logging** — injectable logger for auth lifecycle, HTTP requests, and error diagnostics
- **Circuit breaker** — track consecutive failures and short-circuit during sustained carrier downtime instead of piling up slow timeouts
- **Retry with backoff** — exponential backoff for transient failures before surfacing errors to callers

## Test Results

```
pnpm test

> cybership-carrier@1.0.0 test /Users/shobi/Documents/dev/Career/In Progress/cybership-carrier
> NODE_OPTIONS='--experimental-vm-modules' jest

(node:16648) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
 PASS  tests/ups-rating.test.ts
 PASS  tests/ups-auth.test.ts
  ● Console

    console.info
      [UpsAuth] requesting new token

      at UpsAuthClient.authenticate (src/carriers/ups/UpsAuthClient.ts:62:11)

    console.info
      [UpsAuth] token acquired, expires in 61s

      at UpsAuthClient.authenticate (src/carriers/ups/UpsAuthClient.ts:79:12)

    console.info
      [UpsAuth] serving token from cache

      at UpsAuthClient.accessToken (src/carriers/ups/UpsAuthClient.ts:45:12)

    console.info
      [UpsAuth] requesting new token

      at UpsAuthClient.authenticate (src/carriers/ups/UpsAuthClient.ts:62:11)

    console.info
      [UpsAuth] token acquired, expires in 14400s

      at UpsAuthClient.authenticate (src/carriers/ups/UpsAuthClient.ts:79:12)


Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        0.457 s, estimated 1 s
Ran all test suites.
```
