import { exec, execSync } from "child_process"
import { S3Client, S3ClientConfig, PutObjectCommandInput } from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import { createReadStream, createWriteStream, unlink, statSync } from "fs"
import { filesize } from "filesize"
import path from "path"
import os from "os"
import { spawn } from "child_process"
import { createGzip } from "zlib"


import { env } from "./env.js"
import { createMD5 } from "./util.js"

const uploadToS3 = async ({ name, path: filePath }: { name: string; path: string }) => {
  console.log("Uploading backup to R2 (S3 API)...")

  // Use your R2 bucket name
  const bucket = env.CF_BUCKET

  const clientOptions: S3ClientConfig = {
    // Cloudflare suggests "auto"; any non-empty region string is fine
    region: "auto",
    // Required for R2/custom endpoints to avoid virtual-hosted–style issues
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.CF_ACCESS_KEY_ID,
      secretAccessKey: env.CF_ACCESS_SECRET,
    },
  }

  // Use the R2 S3 endpoint, e.g. https://<accountid>.r2.cloudflarestorage.com
  if (env.CF_ENDPOINT) {
    clientOptions.endpoint = env.CF_ENDPOINT
    console.log(`Using custom endpoint: ${clientOptions.endpoint}`)
  }

  if (env.BUCKET_SUBFOLDER) {
    name = `${env.BUCKET_SUBFOLDER}/${name}`
  }

  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: name,
    Body: createReadStream(filePath),
    // R2 accepts standard mime; optional:
    ContentType: "application/gzip",
  }

  // Optional integrity header; fine for R2
  if (env.SUPPORT_OBJECT_LOCK) {
    console.log("MD5 hashing file...")
    const md5Hex = await createMD5(filePath)
    params.ContentMD5 = Buffer.from(md5Hex, "hex").toString("base64")
    console.log("Done hashing file")
    // If you're actually using Object Lock, you can also set:
    // params.ObjectLockMode = "GOVERNANCE" | "COMPLIANCE"
    // params.ObjectLockRetainUntilDate = new Date(...)
    // params.ObjectLockLegalHoldStatus = "ON" | "OFF"
  }

  const client = new S3Client(clientOptions)

  await new Upload({
    client,
    params,
    // Optional: tune part size / concurrency if needed
    // queueSize: 4,
    // partSize: 8 * 1024 * 1024,
    // leavePartsOnError: false,
  }).done()

  console.log("Backup uploaded to R2.")
}

const dumpToFile = async (filePath: string) => {
  console.log("Dumping DB to file...")

  // Ensure sslmode=require for Railway
  const url = env.BACKUP_DATABASE_URL.includes("sslmode=")
    ? env.BACKUP_DATABASE_URL
    : `${env.BACKUP_DATABASE_URL}${env.BACKUP_DATABASE_URL.includes("?") ? "&" : "?"}sslmode=require`

  // Build args for pg_dump
  const args = ["--dbname", url, "--format=tar"]
  if (env.BACKUP_OPTIONS) {
    // simple split (avoid quotes in BACKUP_OPTIONS)
    args.push(...env.BACKUP_OPTIONS.split(/\s+/).filter(Boolean))
  }

  // Spawn pg_dump → gzip → file
  const dump = spawn("pg_dump", args, { stdio: ["ignore", "pipe", "pipe"] })
  const gzip = createGzip()
  const out = createWriteStream(filePath)

  let pgExitCode: number | null = null

  dump.stderr.on("data", (d) => {
    // surface pg_dump warnings/errors
    process.stdout.write(`[pg_dump] ${d}`)
  })

  const done = new Promise<void>((resolve, reject) => {
    dump.on("error", (err) => reject({ error: `pg_dump spawn error: ${err.message || err}` }))
    gzip.on("error", (err) => reject({ error: `gzip error: ${err.message || err}` }))
    out.on("error", (err) => reject({ error: `write error: ${err.message || err}` }))

    dump.on("close", (code) => {
      pgExitCode = code
      // we’ll still wait for the file stream to finish
    })

    out.on("close", () => {
      // Validate pg_dump exit + that something was written
      if (pgExitCode !== 0) {
        reject({ error: `pg_dump exited with code ${pgExitCode}` })
        return
      }
      try {
        const size = statSync(filePath).size
        if (size <= 0) {
          reject({ error: "Backup archive file is invalid or empty; pg_dump produced no data" })
          return
        }
        console.log("Backup archive file is valid")
        console.log("Backup filesize:", filesize(size))
        resolve()
      } catch (e: any) {
        reject({ error: `stat failed: ${e?.message || e}` })
      }
    })
  })

  // Wire the pipeline
  dump.stdout.pipe(gzip).pipe(out)

  await done
  console.log("DB dumped to file...")
}

const deleteFile = async (p: string) => {
  console.log("Deleting file...")
  await new Promise<void>((resolve, reject) => {
    unlink(p, (err) => (err ? reject({ error: err }) : resolve()))
  })
}

export const backup = async () => {
  console.log("Initiating DB backup...")

  const date = new Date().toISOString()
  const timestamp = date.replace(/[:.]+/g, "-")
  const filename = `${env.BACKUP_FILE_PREFIX}-${timestamp}.tar.gz`
  const filepath = path.join(os.tmpdir(), filename)

  await dumpToFile(filepath)
  await uploadToS3({ name: filename, path: filepath })
  await deleteFile(filepath)

  console.log("DB backup complete.")
}
