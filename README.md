# JalDrishti — GIS-based Water Infrastructure Monitoring Platform

JalDrishti is a GIS-based water infrastructure monitoring platform for field officers in Rajasthan, India. It provides spatial analysis, geo-tagged evidence management, watershed monitoring via live satellite data (Google Earth Engine, Landsat 8/9 at 30 m resolution), NDVI/NDWI analysis, intervention ranking, impact simulation, and an AI chatbot assistant.

## Features

- **Dashboard** — District-scoped overview of water infrastructure health
- **Map** — Interactive OpenLayers GIS map with watershed and infrastructure layers
- **Spatial Analysis** — Live LULC classification (Landsat 8/9, 30 m, NDVI/NDWI thresholds)
- **Geo-Image Intelligence** — EXIF/OCR geo-coded field photo analysis linked to Earth Engine point-buffer analysis
- **Alerts** — Live-computed maintenance and inspection alerts
- **Reports** — District-level infrastructure reports
- **What-If Simulator** — Intervention impact scenario simulator
- **Chatbot** — AI-powered assistant for field officers

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, OpenLayers, Recharts, Zustand, Tailwind CSS
- **Backend**: Node.js, Express 4, JSON Web Tokens (bcrypt auth)
- **Satellite**: Google Earth Engine JavaScript SDK (`@google/earthengine`) — live Landsat 8/9 analysis
- **Satellite proxy**: Bhoonidhi (NRSC/ISRO) STAC API proxy

---

## Local Development

### Prerequisites

- Node.js 18+
- A Google Earth Engine service account key (optional — the app works without it, EE routes return `503 not_configured`)

### 1. Frontend

```bash
npm install
npm run dev          # http://localhost:5173
```

Set `VITE_API_URL` in a `.env` file at the project root if your backend runs on a different port (defaults to `http://localhost:4000`).

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
# Edit .env and fill in JWT_SECRET (required) and optionally EE_SERVICE_ACCOUNT_KEY_PATH
node index.js        # http://localhost:4000
```

### Demo login

Username: **patel** / Password: **Patel@123** (Dungarpur District Watershed Officer account)

---

## Deployment

The project is split into two services — deploy the **backend first**, then the **frontend**.

### Backend — Render Web Service

| Setting | Value |
|---|---|
| **Root directory** | `server` |
| **Build command** | `npm install` |
| **Start command** | `node index.js` |
| **Node version** | 18 or 20 (set via `NODE_VERSION` env var, or in Render settings) |

#### Required environment variables (set in Render dashboard — **never commit these**)

| Variable | Description |
|---|---|
| `JWT_SECRET` | Any long random string, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `EE_SERVICE_ACCOUNT_KEY_JSON` | The **full contents** of your GCP service-account JSON key, on a single line. Generate with: `node -e "console.log(JSON.stringify(require('./ee-service-account-key.json')))"` |

#### Optional environment variables

| Variable | Description |
|---|---|
| `FRONTEND_ORIGIN` | Your deployed frontend URL (e.g. `https://jaldrishti.onrender.com`). If omitted, all origins are allowed (fine for a demo). |
| `BHOONIDHI_USER` | Bhoonidhi (NRSC) account username |
| `BHOONIDHI_PASS` | Bhoonidhi (NRSC) account password |

> **Health check**: After deploying the backend, visit `https://<your-backend>.onrender.com/api/status` — it returns a JSON object confirming which services are configured. **No secrets are exposed.**

---

### Frontend — Render Static Site

| Setting | Value |
|---|---|
| **Root directory** | *(leave blank — build runs from repo root)* |
| **Build command** | `npm install && npm run build` |
| **Publish directory** | `dist` |

#### Required build-time environment variable (set in Render dashboard **before** first build)

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your deployed backend URL, e.g. `https://jaldrishti-backend.onrender.com` — **no trailing slash** |

> **Important**: `VITE_API_URL` is baked into the static bundle at build time by Vite. Setting it as a runtime environment variable after the build does nothing — it must be set **before** `npm run build` runs.

#### React Router — SPA rewrites

The file `public/_redirects` already contains `/* /index.html 200`, which tells Render's static site CDN to serve `index.html` for all routes, enabling client-side routing. No additional configuration is needed.

---

## Secrets — What Must NEVER Be Committed to GitHub

| File / Variable | Status |
|---|---|
| `server/.env` | ❌ Blocked by `.gitignore` — never commit |
| `server/ee-service-account-key.json` | ❌ Blocked by `.gitignore` — never commit |
| `JWT_SECRET` value | ❌ Enter only in Render dashboard |
| `EE_SERVICE_ACCOUNT_KEY_JSON` value | ❌ Enter only in Render dashboard |
| `BHOONIDHI_USER` / `BHOONIDHI_PASS` values | ❌ Enter only in Render dashboard |

Only the **variable names** (not values) appear in `.env.example` files — safe to commit.

---

## Earth Engine Setup

1. Create a GCP project at https://console.cloud.google.com
2. Create a service account at https://console.cloud.google.com/iam-admin/serviceaccounts
3. Download the JSON key for the service account
4. Register the service account for Earth Engine at https://signup.earthengine.google.com/#!/service_accounts
5. On Render, paste the key contents as `EE_SERVICE_ACCOUNT_KEY_JSON` (single-line JSON)

Earth Engine features: live Landsat 8/9 LULC classification, NDVI, NDWI, 30 m spatial resolution, cloud-masked median composites, point-buffer analysis for geo-coded field photos.
