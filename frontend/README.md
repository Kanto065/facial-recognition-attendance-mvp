# Warehouse Access Control — Admin Frontend

Admin dashboard for the warehouse facial-recognition attendance & zone access system. React + TypeScript + Vite, shadcn/ui, TanStack Query, React Router.

See `docs/warehouse-architecture.md` at the repo root for the overall system architecture and milestone plan.

## Development

```
npm install
npm run dev
```

Runs on `http://localhost:8080`. Requires the backend (`backend/`) running on `http://localhost:8000` (see the backend's own README) — configurable via `VITE_API_BASE_URL` in `.env.development`.

## Build

```
npm run build
```

Outputs to `dist/`, which the FastAPI backend serves directly in production (see `backend/app/main.py`).
