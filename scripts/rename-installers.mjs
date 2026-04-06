import { promises as fs } from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const packageJsonPath = path.join(rootDir, 'package.json')
const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
const version = String(process.env.AETHERSTREAM_VERSION || packageJson.version || '').trim()

if (!version) {
  throw new Error('Missing version. Set AETHERSTREAM_VERSION or package.json version.')
}

const bundleDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle')
const installersDir = path.join(bundleDir, 'installers')

const targetNames = {
  exe: `AetherStream_${version}.exe`,
  msi: `AetherStream_${version}.msi`,
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function removeIfExists(filePath) {
  if (await exists(filePath)) {
    await fs.unlink(filePath)
  }
}

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath))
    } else {
      files.push(entryPath)
    }
  }

  return files
}

function isNsisInstaller(filePath) {
  const lower = filePath.toLowerCase()
  return lower.includes(`${path.sep}nsis${path.sep}`) && lower.endsWith('.exe')
}

function isMsiInstaller(filePath) {
  const lower = filePath.toLowerCase()
  const isWindowsMsiFolder = lower.includes(`${path.sep}msi${path.sep}`) || lower.includes(`${path.sep}wix${path.sep}`)
  return isWindowsMsiFolder && lower.endsWith('.msi')
}

async function pickLargest(files) {
  if (!files.length) return null

  const withSize = await Promise.all(files.map(async (filePath) => ({
    filePath,
    size: (await fs.stat(filePath)).size,
  })))

  withSize.sort((left, right) => right.size - left.size)
  return withSize[0].filePath
}

async function moveToTargetName(sourcePath, targetName) {
  const targetPath = path.join(path.dirname(sourcePath), targetName)
  if (sourcePath.toLowerCase() === targetPath.toLowerCase()) {
    return targetPath
  }

  await removeIfExists(targetPath)
  await fs.rename(sourcePath, targetPath)
  return targetPath
}

async function mirrorToInstallersDirectory(sourcePath, targetName) {
  await fs.mkdir(installersDir, { recursive: true })
  const finalPath = path.join(installersDir, targetName)
  await removeIfExists(finalPath)
  await fs.copyFile(sourcePath, finalPath)
  return finalPath
}

if (!(await exists(bundleDir))) {
  throw new Error(`Bundle folder not found: ${bundleDir}`)
}

const allFiles = await collectFiles(bundleDir)
const filteredFiles = allFiles.filter((filePath) => !filePath.toLowerCase().includes(`${path.sep}installers${path.sep}`))

const exeSource = await pickLargest(filteredFiles.filter(isNsisInstaller))
const msiSource = await pickLargest(filteredFiles.filter(isMsiInstaller))

if (!exeSource && !msiSource) {
  throw new Error('No Windows installer files were found in the bundle output.')
}

if (exeSource) {
  const renamedExe = await moveToTargetName(exeSource, targetNames.exe)
  const publishedExe = await mirrorToInstallersDirectory(renamedExe, targetNames.exe)
  console.log(`Prepared EXE installer: ${publishedExe}`)
} else {
  console.warn('EXE installer not found. Skipping EXE rename.')
}

if (msiSource) {
  const renamedMsi = await moveToTargetName(msiSource, targetNames.msi)
  const publishedMsi = await mirrorToInstallersDirectory(renamedMsi, targetNames.msi)
  console.log(`Prepared MSI installer: ${publishedMsi}`)
} else {
  console.warn('MSI installer not found. Skipping MSI rename.')
}
