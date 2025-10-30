## AI Trader — Project Overview (Backup Notes)

### Structure
- **Root scripts**: orchestrate install/build/start for `server` and `client`.
- **Client (`client/`)**: React + Vite + TypeScript, Tailwind, PrimeReact.
- **Server (`server/`)**: Node.js (ESM) + Express, Sequelize, services layer, many route modules.

### Install
Use npm (recommended on Windows):

```powershell
cd C:\Users\Фронтендер3000\projects\ai-trader
npm run install:all
```

What it does:
- `npm install` in root
- `npm install` in `server/`
- `npm install` in `client/`

Windows note: if you ever use Yarn and see PowerShell execution policy errors, either run with npm or enable scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
```

### Run
- Dev combined (root):
```powershell
npm run start
```
This runs server and client concurrently.

- Client only:
```powershell
cd client
npm run dev
```

- Server only:
```powershell
cd server
npm start
```

### Build (client)
```powershell
cd client
npm run build
```
Server serves `client/dist` statics in production.

### Server
- Entry: `server/src/app.js`
- Port: `PORT` env or `3001` by default
- Health: `GET /health`
- API base: `GET /api/*` (mounted via `optimized-routes.js`)

### Server Routes (modules)
Mounted under various routers; key files in `server/src/routes/`:
- `ai-routes.js`
- `capital-allocation-routes.js`
- `capital-scaling-routes.js`
- `ensemble-routes.js`
- `errors-routes.js`
- `market-routes.js`
- `neural-network-routes.js`
- `news-routes.js`
- `notifications-routes.js`
- `optimized-routes.js` (+ `optimized-routes-backup.js`)
- `performance-analyzer-routes.js`
- `portfolio-migrator-routes.js`
- `portfolio-routes.js`
- `preflight-check-routes.js`
- `profitability-routes.js`
- `risk-adjustment-routes.js`
- `risk-management-routes.js`
- `stage3-validator-routes.js`
- `switch-validator-routes.js`
- `system-routes.js`
- `telegram-routes.js`
- `trading-mode-routes.js`
- `trading-requests-routes.js`
- `trading-routes.js`
- `training-routes.js`

### Services (selection)
Located in `server/src/services/` — notable components:
- `ServiceManager.js`, `GlobalServiceManager.js` — system orchestration
- AI/ML: `NeuralNetworkService.js`, `ReinforcementLearningService.js`, `MetaLearningService.js`, `EnsembleService.js`, `OptimizedTrainingService.js`
- Trading: `TradingEngine.js`, `TradingModeManager.js`, `TradingRequestService.js`, `RiskManagementService.js`, `CapitalAllocationStrategy.js`, `CapitalScalingService.js`
- Data/API: `TinkoffApiService.js`, `OptimizedDataService.js`, `NewsAnalysisService.js`
- Observability: `PerformanceAnalyzer.js`, `ProfitabilityTracker.js`, `SchedulerService.js`, `WebSocketService.js`

### Client
- Router: `client/src/common/AppRouter.tsx`
- Pages: Dashboard, Portfolio, Settings, NeuralNetworks, TradingRequests, MetricsMonitoring, TrainingDebug, TradingModeManager, TradingModeDashboardPage
- WebSocket context/hooks in `client/src/contexts` and `client/src/hooks`

### Environment
- Copy `server/env.example` → `.env` and set:
  - `PORT=3001` (optional)
  - Database connection vars (as required by `server/src/config/database.js`)
  - Optional telegram token: `TELEGRAM_BOT_TOKEN`

### Common Issues (Windows)
- PowerShell blocks yarn scripts: use npm or run `Set-ExecutionPolicy ...` above.
- Root `clean` uses `rm -rf` (Unix). Prefer `rimraf` or run in Git Bash:
  - Replace script with: `rimraf node_modules server/node_modules client/node_modules`

### Useful URLs
- Dashboard: `http://localhost:3001`
- API: `http://localhost:3001/api`
- Health: `http://localhost:3001/health`

### Quick Commands
```powershell
# Install all
npm run install:all

# Start both (dev)
npm run start

# Client dev
cd client; npm run dev

# Server dev
cd server; npm start

# Client build
cd client; npm run build
```


