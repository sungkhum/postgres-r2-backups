import { exec, execSync } from "child_process"
import { createProvider } from "strapi-provider-cloudflare-r2"
import { createReadStream, unlink, statSync } from "fs"
import { filesize } from "filesize"
import path from "path"
import os from "os"

import { env } from "./env.js"

const uploadToR2 = async ({ name, path }: { name: string; path: string }) => {
  console.log("Uploading backup to Cloudflare R2...")

  const provider = createProvider({
    accessKeyId: env.CF_ACCESS_KEY_ID,
    secretAccessKey: env.CF_ACCESS_SECRET,
    bucket: env.CF_BUCKET,
    endpoint: env.CF_ENDPOINT,
    cloudflarePublicAccessUrl: env.CF_PUBLIC_ACCESS_URL,
  })

  console.log(`Using Cloudflare R2 endpoint: ${env.CF_ENDPOINT}`)

  if (env.BUCKET_SUBFOLDER) {
    name = env.BUCKET_SUBFOLDER + "/" + name
  }

  const fileStream = createReadStream(path)

  await provider.upload({
    name: name,
    buffer: fileStream,
    ext: ".tar.gz",
    mime: "application/gzip",
  })

  console.log("Backup uploaded to Cloudflare R2...")
}

const dumpToFile = async (filePath: string) => {
  console.log("Dumping DB to file...")

  await new Promise((resolve, reject) => {
    exec(
      `pg_dump --dbname=${env.BACKUP_DATABASE_URL} --format=tar ${env.BACKUP_OPTIONS} | gzip > ${filePath}`,
      (error, stdout, stderr) => {
        if (error) {
          reject({ error: error, stderr: stderr.trimEnd() })
          return
        }

        const isValidArchive = execSync(`gzip -cd ${filePath} | head -c1`).length == 1 ? true : false
        if (isValidArchive == false) {
          reject({ error: "Backup archive file is invalid or empty; check for errors above" })
          return
        }

        if (stderr != "") {
          console.log({ stderr: stderr.trimEnd() })
        }

        console.log("Backup archive file is valid")
        console.log("Backup filesize:", filesize(statSync(filePath).size))

        if (stderr != "") {
          console.log(
            `Potential warnings detected; Please ensure the backup file "${path.basename(filePath)}" contains all needed data`,
          )
        }

        resolve(undefined)
      },
    )
  })

  console.log("DB dumped to file...")
}

const deleteFile = async (path: string) => {
  console.log("Deleting file...")
  await new Promise((resolve, reject) => {
    unlink(path, (err) => {
      if (err) {
        reject({ error: err })
        return
      }
      resolve(undefined)
    })
  })
}

export const backup = async () => {
  console.log("Initiating DB backup...")

  const date = new Date().toISOString()
  const timestamp = date.replace(/[:.]+/g, "-")
  const filename = `${env.BACKUP_FILE_PREFIX}-${timestamp}.tar.gz`
  const filepath = path.join(os.tmpdir(), filename)

  await dumpToFile(filepath)
  await uploadToR2({ name: filename, path: filepath })
  await deleteFile(filepath)

  console.log("DB backup complete...")
}
