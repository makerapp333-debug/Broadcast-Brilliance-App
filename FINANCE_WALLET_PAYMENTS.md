# Finance, Wallet & Payments (v2.5.0)

## Architecture
- **Frontend** never holds M-Pesa/IntaSend secrets.
- **Server** (`server/src/finance/`) owns ledger, wallets, payments, webhooks.
- Amounts stored as **integer minor units** (cents).
- **40%/60% split** applies only to guest-token and advertising revenue — not deposits or subscriptions.

## Run (TEST mode — no real money)
```bash
cd server
export FINANCE_MODE=TEST
node src/index.js
```
Open the app (same host or set Settings finance/bridge URL to `http://localhost:8787`).

## API (header `X-User-Id: u1`)
- GET `/api/v1/finance/wallet`
- GET `/api/v1/finance/transactions`
- POST `/api/v1/finance/payments/initiate`
- POST `/api/v1/finance/payments/:id/test-complete` (TEST only)
- POST `/api/v1/finance/pin`
- POST `/api/v1/finance/destinations`
- POST `/api/v1/finance/withdrawals`
- GET/POST subscriptions & guest-tokens
- POST `/api/v1/webhooks/mpesa` · `/api/v1/webhooks/intasend`

## Env vars (server only)
See `server/.env.example`

## Production checklist
1. Set `FINANCE_MODE=PRODUCTION`
2. Configure Daraja + IntaSend secrets on the Droplet
3. Set public HTTPS callback URLs
4. Replace `X-User-Id` demo auth with real JWT/session
5. Migrate file ledger to Postgres when ready


## Earnings & withdrawals (v2.5.10+)

- Guest-token & ad revenue → **pending** (60% creator)
- `POST /api/v1/finance/earnings/settle` → pending → available
- Withdraw holds **gross**; fee → platform; **net** paid to destination
- `GET /api/v1/finance/withdrawals` — user history
- Admin: approve/process/complete; config min/fee
- Home dashboard shows wallet snapshot when finance API is up

### Withdrawal statuses
PENDING → UNDER_REVIEW → APPROVED → PROCESSING → COMPLETED
(or REJECTED / FAILED / CANCELLED — hold released)


## Rate limiting (v2.5.14)

In-process limits (reset on server restart):

| Action | Limit |
|--------|-------|
| Payment initiate | 15 / min |
| PIN set | 5 / 5 min |
| Withdrawal request | 8 / 5 min |
| Guest token purchase | 12 / min |

HTTP 429 when exceeded. Replace with Redis/gateway limits in production.
