# Compliance screening app — TypeScript conversion

Converted from the original Python/Streamlit app. NestJS backend wraps
PortAble Agent, Vartion Pascal, and Lloyd's List SeaSearcher; Angular
frontend reproduces the screening workflow UI.

```
compliance-app/
├── backend/                   # NestJS API
│   ├── .env.example           # <-- copy to .env and fill in credentials
│   └── src/
│       ├── seasearcher/       # Lloyd's List SeaSearcher client
│       ├── pascal/            # Vartion Pascal client
│       ├── portable/          # PortAble Agent client + BL reader (PDF/OCR)
│       └── screening/         # Orchestrates the three above; REST controller
└── frontend/                  # Angular app
    └── src/app/screening/     # The screening workflow component
```

## 1. Backend setup

```bash
cd backend
cp .env.example .env
# edit .env with your real SeaSearcher / Pascal / PortAble credentials
npm install
npm run start:dev
```

Runs on `http://localhost:3000`. Endpoints:

- `GET  /screening/portcalls/:portcallNumber`
- `POST /screening/extract-bl`
- `POST /screening/run`

## 2. Frontend setup

```bash
cd frontend
npm install
npm start
```

Runs on `http://localhost:4200` and proxies `/api/*` to the backend on
port 3000 (see `proxy.conf.json`) — so the backend must be running for
the UI to load any data.

## Config reference (backend/.env)

| Variable | Notes |
|---|---|
| `PORT` | Backend port, default 3000 |
| `API_TIMEOUT` | Shared request timeout (ms) for all three API clients |
| `SEASEARCHER_BASE_URL` / `SEASEARCHER_USERNAME` / `SEASEARCHER_PASSWORD` | Lloyd's List SeaSearcher |
| `PASCAL_BASE_URL` / `PASCAL_AUTH_TOKEN` / `PASCAL_ORG_ID` | Vartion Pascal — token sent as `Authorization: Bearer <PASCAL_AUTH_TOKEN>` |
| `PORTABLE_BASE_URL` / `PORTABLE_EMAIL` / `PORTABLE_PASSWORD` | PortAble Agent login |

## Known gaps / things to verify before relying on this

- **`BL_PATTERN` branch-2 quirk** (`backend/src/portable/bl-reader.interface.ts`) — ported exactly from the Python `re.VERBOSE` pattern, including what looks like an unintentional bug where "bill of lading" only matches with zero separators between words (e.g. matches `BillOfLading.pdf`, not `Bill_of_Lading.pdf`). Flagged in-file; test against your real attachment filenames.
- **Pascal bank-search response shape** (`getBankName` in `pascal.service.ts`) — the original reads `data` as a single object there but as an array in case search, for what looks like the same endpoint. Kept as-is; unverified against a live response.
- **PDF/OCR libraries** (`pdf-parse`, `pdf-to-png-converter`, `tesseract.js`) are new dependencies not in the original Python stack — verify extraction quality against real BL documents, especially scanned PNGs and text-less (scanned) PDFs via OCR.
- **CORS is wide open** in `main.ts` (`app.enableCors()`) for local testing — lock this down before any real deployment.
- **No auth/session layer for the app itself** — none was in the original Streamlit app either, so none has been added here. Add one before exposing this beyond local testing.
