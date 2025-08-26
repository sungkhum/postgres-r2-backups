import { exec, execSync } from "child_process"
import { S3Client, S3ClientConfig, PutObjectCommandInput } from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import { createReadStream, unlink, statSync } from "fs"
import { filesize } from "filesize"
import path from "path"
import os from "os"

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

  // Ensure sslmode=require for Railway; append if missing
  const url = env.BACKUP_DATABASE_URL.includes("sslmode=")
    ? env.BACKUP_DATABASE_URL
    : `${env.BACKUP_DATABASE_URL}${env.BACKUP_DATABASE_URL.includes("?") ? "&" : "?"}sslmode=require`

  // Use pipefail so pg_dump errors fail the whole pipeline
  const cmd = `bash -lc 'set -o pipefail; pg_dump --dbname="${url}" --format=tar ${env.BACKUP_OPTIONS ?? ""} | gzip > "${filePath}"'`

  await new Promise<void>((resolve, reject) => {
    exec(cmd, (error, _stdout, stderr) => {
      if (error) {
        reject({ error: error.message || error, stderr: stderr?.trim() })
        return
      }
      try {
        const hasByte = execSync(`bash -lc 'gzip -cd "${filePath}" | head -c1 | wc -c'`).toString().trim()
        if (hasByte !== "1") {
          reject({ error: "Backup archive file is invalid or empty; pg_dump produced no data", stderr: stderr?.trim() })
          return
        }
      } catch (e: any) {
        reject({ error: "Failed to read/validate gzip output", stderr: String(e?.stderr || e?.message || e) })
        return
      }

      if (stderr) console.log({ stderr: stderr.trim() })
      console.log("Backup archive file is valid")
      console.log("Backup filesize:", filesize(statSync(filePath).size))
      resolve()
    })
  })

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
