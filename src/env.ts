import { envsafe, str, bool } from "envsafe"

export const env = envsafe({
  CF_ACCESS_KEY_ID: str({
    desc: "Your Cloudflare R2 API Token (Access Key ID)",
  }),
  CF_ACCESS_SECRET: str({
    desc: "Your Cloudflare R2 API Secret (Secret Access Key)",
  }),
  CF_BUCKET: str({
    desc: "The Cloudflare R2 bucket name",
  }),
  CF_ENDPOINT: str({
    desc: "The R2 endpoint URL (format: https://[account-id].r2.cloudflarestorage.com)",
  }),
  CF_PUBLIC_ACCESS_URL: str({
    desc: "Optional: Cloudflare R2 public access URL for CDN (recommended for files >5MB)",
    default: "",
    allowEmpty: true,
  }),
  BACKUP_DATABASE_URL: str({
    desc: "The connection string of the database to backup.",
  }),
  BACKUP_CRON_SCHEDULE: str({
    desc: "The cron schedule to run the backup on.",
    default: "0 5 * * *",
    allowEmpty: true,
  }),
  RUN_ON_STARTUP: bool({
    desc: "Run a backup on startup of this application",
    default: false,
    allowEmpty: true,
  }),
  BACKUP_FILE_PREFIX: str({
    desc: "Prefix to the file name",
    default: "backup",
  }),
  BUCKET_SUBFOLDER: str({
    desc: "A subfolder to place the backup files in",
    default: "",
    allowEmpty: true,
  }),
  SINGLE_SHOT_MODE: bool({
    desc: "Run a single backup on start and exit when completed",
    default: false,
    allowEmpty: true,
  }),
  // This is both time consuming and resource intensive so we leave it disabled by default
  SUPPORT_OBJECT_LOCK: bool({
    desc: "Enables support for buckets with object lock by providing an MD5 hash with the backup file",
    default: false,
  }),
  BACKUP_OPTIONS: str({
    desc: "Any valid pg_dump option.",
    default: "",
    allowEmpty: true,
  }),
})
