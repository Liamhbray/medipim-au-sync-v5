# MediPim AU Sync v5

Automated synchronization system for MediPim Australian product data to Supabase.

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start services**
   ```bash
   npm run start:all
   ```

4. **Run sync**
   ```bash
   curl -X POST http://localhost:3003/sync \
     -H "X-ADMIN-KEY: your-secure-admin-key-here"
   ```

## Documentation

- **Application Documentation**: See [`docs/`](./docs/) directory
- **Service Documentation**: See README in each service directory
  - [`services/fetcher/`](./services/fetcher/) - MediPim data fetcher
  - [`services/maintainer/`](./services/maintainer/) - Database processor
  - [`services/orchestrator/`](./services/orchestrator/) - Sync coordinator

## Project Structure

```
.
├── services/           # Microservices
├── docs/              # Application documentation
├── deployment/        # Production configs
├── .env               # Environment config
├── docker-compose.yml # Docker setup
└── package.json       # Dependencies
```

## License

Private - Proprietary