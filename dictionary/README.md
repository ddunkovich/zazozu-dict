# Репозиторий словаря (feature 016)

Этот каталог — **исходники и инструменты словаря** для системы коллективного обогащения.
Он предназначен для зеркалирования в отдельный GitHub-репозиторий (`DICT_REPO`), куда
Cloudflare Worker пишет входящие предложения, а GitHub Actions готовят их к ревью и
публикуют релизы. См. `specs/016-collaborative-dictionary/contracts/dictionary-repo.md`.

## Структура

```
dictionary/
├── source/pl/*.jsonl        # истина словаря (entryKey-нормализовано, без dictionaryId)
├── contributions/YYYY/MM/   # входящие пакеты (пишет worker)
├── schema/*.json            # JSON-схемы contribution/source-entry/manifest
├── builder/                 # Dictionary Builder (source → sqlite + бандлы + manifest + checksum)
└── .github/workflows/       # contribution-intake.yml, release.yml
```

## Поток

1. Клиент → `POST /contributions` (worker) → файл `contributions/YYYY/MM/<batchId>.json`.
2. `contribution-intake.yml`: validate → normalize → dedup → find entryKey → conflicts →
   review-report → **PR от бота** (без авто-мержа, `INV-ADMIN`).
3. Администратор вручную ревьюит PR: **Accept / Reject / Edit / Merge with existing /
   Change entryKey** (правкой файлов `source/**`; при смене ключа — добавлением записи в
   `remap` манифеста). Отклонённые предложения не мержатся.
4. Merge в `main` → `release.yml`: `builder/build.mjs` → `dictionary.sqlite` + JSON-бандлы +
   `manifest.json` + `version.json` + `checksum` → GitHub Release.
5. Клиент опрашивает манифест, проверяет checksum, атомарно заменяет базу и мигрирует
   пользовательские данные без потери прогресса.

## Секреты и конфигурация Worker

GitHub-токен хранится **только** как Cloudflare Secret (никогда в `wrangler.toml`, `INV-SECRET`):

```sh
cd workers/openrouter-proxy
wrangler secret put GITHUB_TOKEN
```

Переменные (`wrangler.toml [vars]`):

- `DICT_REPO` — `owner/repo` целевого репозитория словаря.
- `DICT_BASE_BRANCH` — базовая ветка (по умолчанию `main`).
- `MAX_BODY_BYTES` — лимит размера тела `POST /contributions` (по умолчанию 1 МБ).

## Инварианты

- `INV-ADMIN` — базовый словарь меняется только после ручного подтверждения (FR-023).
- `INV-ID-1` — существующие `dictionaryId` не переназначаются при сборке.
- `INV-EK-1` — `entryKey` постоянен; смена — только через `EntryKeyRemap` в манифесте.
- Сборка детерминирована (`FR-026`).
