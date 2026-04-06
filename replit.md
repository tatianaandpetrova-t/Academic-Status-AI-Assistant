# ИТМО — ИИ-ассистент Учёного Звания

## Overview

Полноценное веб-приложение для преподавателей ИТМО — автоматизированная проверка соответствия критериям учёного звания (доцент/профессор) согласно Постановлению РФ №1139 с ИИ-чатом для консультаций.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express 5 + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI GPT via Replit AI Integrations (free, no API key needed)
- **Auth**: JWT tokens (bcryptjs)
- **File upload**: Multer
- **Validation**: Zod + drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)

## Features

- Пошаговая форма заявки (4 шага)
- Автоматическая проверка критериев с детализацией
- ИИ-чат ассистент (OpenAI GPT-5.2)
- История заявок
- Загрузка документов
- Экспертная панель (ручная проверка)
- Административная панель (пользователи, критерии, статистика)
- Роли: applicant, expert, admin

## Test Accounts

- **Admin**: admin@itmo.ru / admin123
- **Applicant**: ivanov@itmo.ru / test123

## Structure

```
artifacts/
  api-server/           # Express API server
    src/routes/         # API routes (auth, criteria, applications, chat, documents, admin)
    src/middlewares/    # JWT auth middleware
    src/lib/            # Business logic (criteria-checker.ts)
  itmo-academic-rank/   # React frontend
    src/pages/          # All app pages
    src/hooks/          # API hooks
    src/components/     # UI components
lib/
  db/src/schema/        # Drizzle DB schema (users, criteria, applications, chat, documents, audit)
  api-spec/             # OpenAPI spec (openapi.yaml)
  api-client-react/     # Generated React Query hooks
  api-zod/              # Generated Zod schemas
  integrations-openai-ai-server/  # OpenAI integration
scripts/
  src/seed.ts           # Database seeding script
README.md               # Full setup and deployment guide
```

## Running Commands

- `pnpm --filter @workspace/scripts run seed` — seed initial data
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API types
- `pnpm --filter @workspace/api-server run dev` — start backend
- `pnpm --filter @workspace/itmo-academic-rank run dev` — start frontend

## Criteria (Постановление РФ №1139)

**Доцент**: стаж 5/3 лет, 10 публикаций, 2 уч.изд., 2 Scopus/WoS, кандидат наук
**Профессор**: стаж 10/5 лет, 20 публикаций, 3 уч.изд., 5 Scopus/WoS, доктор наук, 1 аспирант
