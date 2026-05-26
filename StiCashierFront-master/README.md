# STI Cashier

A full-stack cashier system for STI with separate backend and frontend projects.

## Repository structure

- `backend/` – Node.js Express API server
- `frontend/` – Vite + React application

## Backend

### Install

```bash
cd backend
npm install
```

### Run

```bash
npm run dev
```

The backend server starts from `server.js` and uses Express, PostgreSQL, CORS, JWT, and bcrypt.

## Frontend

### Install

```bash
cd frontend
npm install
```

### Run

```bash
npm run dev
```

### Build

```bash
npm run build
```

## GitHub Actions CI

This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that:

- checks out the repository
- installs Node.js dependencies
- installs backend and frontend packages
- builds the frontend

## Notes

- Add environment variables in a `.env` file for backend configuration if needed.
- The frontend uses Vite and React.
