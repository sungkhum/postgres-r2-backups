# PostgreSQL Backup to Cloudflare R2

A Node.js application that automatically backs up PostgreSQL databases with a Strapi backend to Cloudflare R2 storage on a configurable schedule.

[![Deploy on Railway with a Strapi Backend](https://railway.com/button.svg)](https://railway.com/deploy/strapi-with-cloudflare-r2?referralCode=6EnXto&utm_medium=integration&utm_source=template&utm_campaign=generic)

## Features

- 🔄 Automated backups using cron scheduling
- ☁️ Direct upload to Cloudflare R2 storage
- 🗜️ Gzip compression for smaller backup files
- 🔒 Optional MD5 hash support for object lock buckets
- 🚀 Single-shot mode for one-time backups
- 📁 Configurable file prefixes and subfolders
- ⚡ Built with TypeScript for type safety

## Environment Variables

Configure the following environment variables:

### Cloudflare R2 Configuration
- `CF_ACCESS_KEY_ID` - Your Cloudflare R2 API Token
- `CF_SECRET_ACCESS_KEY` - Your Cloudflare R2 API Secret  
- `CF_BUCKET` - The R2 bucket name
- `CF_ENDPOINT` - Your Cloudflare bucket endpoint (without bucket name)
- `CF_PUBLIC_ACCESS_URL` - Cloudflare R2 public access URL for CDN (recommended for files >5MB)

### Database Configuration
- `BACKUP_DATABASE_URL` - Internal Railway PostgreSQL connection string

### Backup Configuration
- `BACKUP_CRON_SCHEDULE` - Cron schedule (default: "0 5 * * *" - daily at 5 AM)
- `RUN_ON_STARTUP` - Run backup on startup (default: false)
- `BACKUP_FILE_PREFIX` - File name prefix (default: "backup")
- `BUCKET_SUBFOLDER` - Subfolder in bucket (optional)
- `SINGLE_SHOT_MODE` - Run once and exit (default: false)
- `SUPPORT_OBJECT_LOCK` - Enable MD5 hash for object lock (default: false)
- `BACKUP_OPTIONS` - Additional pg_dump options (optional)

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Set up your environment variables (see above)

3. Build the application:
   \`\`\`bash
   npm run build
   \`\`\`

4. Start the backup service:
   \`\`\`bash
   npm start
   \`\`\`

## Docker Usage

Build and run with Docker:

\`\`\`bash
docker build -t postgres-r2-backup .
docker run -d --env-file .env postgres-r2-backup
\`\`\`

## Deployment on Railway

This template is designed for easy deployment on Railway.com:

1. Fork this repository
2. Connect it to Railway
3. Set the required environment variables in Railway's dashboard
4. Deploy!

## Backup File Format

Backup files are named: `{BACKUP_FILE_PREFIX}-{timestamp}.sql.gz`

Example: `backup-2024-01-15T10-30-00Z.sql.gz`