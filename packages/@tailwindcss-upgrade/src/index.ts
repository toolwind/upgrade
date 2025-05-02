#!/usr/bin/env node

import { globby } from 'globby'
import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { migrateString, migrate as migrateTemplate } from './codemods/template/migrate'
import { prepareConfig } from './codemods/template/prepare-config'
import { help } from './commands/help'
import { args, type Arg } from './utils/args'
import { isRepoDirty } from './utils/git'
import { hoistStaticGlobParts } from './utils/hoist-static-glob-parts'
import { eprintln, error, header, highlight, info, relative, success } from './utils/renderer'

const options = {
  '--config': { type: 'string', description: 'Path to a single configuration file', alias: '-c' },
  '--configs': {
    type: 'string[]',
    description: 'Paths or globs for multiple configuration files',
    alias: '-C',
  },
  '--help': { type: 'boolean', description: 'Display usage information', alias: '-h' },
  '--force': { type: 'boolean', description: 'Force the migration', alias: '-f' },
  '--source': {
    type: 'string[]',
    description: 'Override template source patterns/globs',
    alias: '-s',
  },
  '--inline-source': {
    type: 'string',
    description: 'Provide utility classes as a string for direct migration',
    alias: '-i',
  },
  '--inline-source-extension': {
    type: 'string',
    description: 'Provide the extension of the inline source file (e.g. "html")',
    alias: '-x',
  },
  '--debug': {
    type: 'boolean',
    description: 'Enable debug mode',
  },
} satisfies Arg
const flags = args(options, ['--debug'])

if (flags['--help']) {
  help({
    usage: [
      'npx @toolwind/upgrade --config <path>',
      'npx @toolwind/upgrade --configs <path|glob>...',
      'npx @toolwind/upgrade --config <path> --source <path|glob>...',
      'npx @toolwind/upgrade --configs <path|glob>... --source <path|glob>...',
      'npx @toolwind/upgrade --config <path> --inline-source "<string>"',
      'npx @toolwind/upgrade --config <path> --inline-source "<string>" --inline-source-extension pug',
    ],
    options,
  })
  process.exit(0)
}

async function run() {
  const initialCwd = process.cwd()
  let repoRoot: string | null = null

  // --- DETECT REPO ROOT USING GIT ---
  try {
    repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: 'pipe' }).trim()
    // Don't log here yet
  } catch (gitError) {
    // Don't log here yet
    repoRoot = initialCwd
  }
  const base = repoRoot
  // --- END DETECT REPO ROOT ---

  // --- Basic Flag Validation ---
  const hasSingleConfig = flags['--config'] !== null
  const hasMultipleConfigs = flags['--configs'] !== null && flags['--configs'].length > 0
  const hasSourceFlag = flags['--source'] !== null && flags['--source'].length > 0
  const hasInlineSourceFlag = flags['--inline-source'] !== null

  if (hasSingleConfig && hasMultipleConfigs) {
    error('Please use either --config or --configs, not both.')
    process.exit(1)
  }
  if (!hasSingleConfig && !hasMultipleConfigs) {
    error('Please provide configuration file path(s) using either --config or --configs.')
    info(`Examples:`)
    info(`  npx @toolwind/upgrade --config path/to/tailwind.config.js`)
    info(`  npx @toolwind/upgrade --configs '**/tailwind.config.{js,ts,cjs}'`)
    process.exit(1)
  }
  if (hasSourceFlag && hasInlineSourceFlag) {
    error('Please use either --source or --inline-source, not both.')
    process.exit(1)
  }
  if (hasInlineSourceFlag && !hasSingleConfig && !hasMultipleConfigs) {
    error('The --inline-source flag requires a configuration file.')
    process.exit(1)
  }
  // --- End Basic Flag Validation ---

  // --- DETERMINE/RESOLVE/LOAD CONFIGS ---
  let configInputs: string[] = []
  if (hasSingleConfig) {
    configInputs.push(flags['--config']!)
  } else {
    configInputs = flags['--configs']!
  }

  let configPathsToProcess = new Set<string>()
  let infoLogsForConfigs: string[] = [] // Collect logs to show later if needed

  // Don't log resolving start yet
  for (let inputPatternOrPath of configInputs) {
    const isGlob = /[*?{}[\\\]]/.test(inputPatternOrPath) || inputPatternOrPath.includes('**')
    if (isGlob) {
      try {
        const foundFiles = await globby(inputPatternOrPath, {
          cwd: base,
          absolute: true,
          onlyFiles: true,
          gitignore: true,
          followSymbolicLinks: false,
          ignore: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.*/**',
            '**/dev-env/root/reporoot/**', // Keep targeted ignore for config search
            '**/common/temp/pnpm-store/**',
          ],
        })
        if (foundFiles.length > 0) {
          foundFiles.forEach((file) => configPathsToProcess.add(file))
          infoLogsForConfigs.push(
            `Glob '${inputPatternOrPath}' resolved to: ${foundFiles.map((f) => highlight(relative(f, base))).join(', ')}`,
          )
        } else {
          infoLogsForConfigs.push(`Glob '${inputPatternOrPath}' did not match any files.`)
        }
      } catch (e: any) {
        // Still log errors immediately
        if (e?.code === 'ENAMETOOLONG') {
          error(
            `Error resolving glob '${inputPatternOrPath}': Path became too long. Check ignore patterns. Error: ${e?.message ?? e}`,
            { prefix: '↳ ' },
          )
        } else {
          error(`Error resolving glob '${inputPatternOrPath}': ${e?.message ?? e}`, { prefix: '↳ ' })
        }
      }
    } else {
      const absolutePath = path.resolve(base, inputPatternOrPath)
      try {
        await fs.access(absolutePath)
        configPathsToProcess.add(absolutePath)
        infoLogsForConfigs.push(
          `Resolved specific path: ${highlight(relative(absolutePath, base))}`,
        )
      } catch {
        error(
          `Specified configuration file not found: ${highlight(inputPatternOrPath)} (resolved relative to ${base})`,
          { prefix: '↳ ' },
        )
      }
    }
  }

  if (configPathsToProcess.size === 0) {
    error('No configuration files found or resolved from the provided inputs. Aborting.')
    process.exit(1)
  }

  let explicitConfigs: Awaited<ReturnType<typeof prepareConfig>>[] = []
  let configLoadSuccessLogs: string[] = []
  let configLoadErrorLogs: string[] = []

  // Don't log loading start yet
  for (let absoluteConfigPath of configPathsToProcess) {
    const relativeConfigPath = relative(absoluteConfigPath, base)
    try {
      let config = await prepareConfig(absoluteConfigPath, { base })
      explicitConfigs.push(config)
      configLoadSuccessLogs.push(`Loaded config: ${highlight(relativeConfigPath)}`)
    } catch (e: any) {
      error(`Failed to load config ${highlight(relativeConfigPath)}: ${e?.message ?? e}`, { prefix: '↳ ' })
      console.error(`[DEBUG] Full error details for ${relativeConfigPath}:`)
      console.error(e)
      // Don't push to success logs, maybe collect error logs if needed elsewhere
    }
  }

  if (explicitConfigs.length === 0) {
    error('No valid configuration files could be loaded successfully. Aborting.')
    process.exit(1)
  }
  // --- END CONFIG LOADING ---

  // --- TEMPLATE MIGRATION ---
  if (explicitConfigs.length > 0) {
    // Check if we are doing inline migration
    if (flags['--inline-source']) {
      const inlineSource = flags['--inline-source'] as string

      // --- SINGLE CONFIG OPTIMIZED PATH --- >> Check **loaded** config count << ---
      if (explicitConfigs.length === 1) {
        const config = explicitConfigs[0]
        try {
          const migratedString = await migrateString(
            config.designSystem,
            config.userConfig,
            inlineSource,
            flags['--inline-source-extension'],
          )
          // Output only the raw string (plus newline) to stdout and exit
          console.log(migratedString)
          process.exit(0)
        } catch (e: any) {
          // Output only the error message to stderr and exit
          eprintln(`Error migrating inline source: ${e?.message ?? e}`)
          process.exit(1)
        }
      }
      // --- END SINGLE CONFIG PATH ---

      // --- MULTIPLE CONFIGS PATH (Existing Logic) ---
      else {
        info('Migrating provided inline source string...')
        for (let config of explicitConfigs) {
          const relativeConfigPath = relative(config.configFilePath, base)
          try {
            const migratedString = await migrateString(
              config.designSystem,
              config.userConfig,
              inlineSource,
              flags['--inline-source-extension'],
            )
            eprintln() // Add spacing
            info(`Result using config ${highlight(relativeConfigPath)}:`)
            console.log(migratedString)
            eprintln() // Add spacing
          } catch (e: any) {
            error(
              `Failed to migrate inline source using config ${highlight(relativeConfigPath)}: ${e?.message ?? e}`,
              { prefix: '↳ ' },
            )
            console.error(
              `[DEBUG] Full error details for inline migration with ${relativeConfigPath}:`,
            )
            console.error(e)
          }
        }
        success('Inline source migration complete.')
        process.exit(0) // Exit after multi-inline processing
      }
      // --- END MULTIPLE CONFIGS PATH ---
    } else {
      // --- FILE MIGRATION --- (if not inline)
      info('Migrating templates based on loaded configurations and source patterns…')
      for (let config of explicitConfigs) {
        let templatesForThisConfig = new Set<string>()
        info(`Finding templates for config: ${highlight(relative(config.configFilePath, base))}`)

        const sourcePatternsInput =
          flags['--source'] ?? config.sources.flatMap((entry) => hoistStaticGlobParts(entry))

        for (let globEntry of sourcePatternsInput) {
          let pattern: string
          let cwd: string
          if (typeof globEntry === 'string') {
            pattern = globEntry
            cwd = base
          } else {
            pattern = globEntry.pattern
            cwd = globEntry.base
          }

          try {
            let files = await globby([pattern], {
              absolute: true,
              gitignore: true,
              cwd: cwd,
              ignore: [
                '**/node_modules/**',
                '**/dist/**',
                '**/.*/**',
                '**/common/temp/pnpm-store/**', // No specific ignores here, rely on .gitignore
              ],
            })
            files.forEach((file) => templatesForThisConfig.add(file))
          } catch (e: any) {
            if (e?.code === 'ENAMETOOLONG') {
              error(
                `Error scanning template source '${pattern}': Path became too long. Consider adding ignores to your .gitignore. Error: ${e?.message ?? e}`,
                { prefix: '↳ ' },
              )
            } else {
              error(`Error scanning template source '${pattern}': ${e?.message ?? e}`, { prefix: '↳ ' })
            }
          }
        }

        let filesToMigrate = Array.from(templatesForThisConfig)
        filesToMigrate.sort()

        if (filesToMigrate.length > 0) {
          info(
            `Migrating ${filesToMigrate.length} template(s) for ${highlight(relative(config.configFilePath, base))}...`,
            { prefix: '↳ ' },
          )
          let migrationResults = await Promise.allSettled(
            filesToMigrate.map((file) =>
              migrateTemplate(config.designSystem, config.userConfig, file),
            ),
          )
          migrationResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              if ((result.reason as any)?.code === 'EMFILE') {
                error(
                  `Failed to migrate ${highlight(relative(filesToMigrate[index], base))}: Too many open files (EMFILE). Consider adjusting system limits or refining ignore patterns.`,
                  { prefix: '↳ ' },
                )
              } else {
                error(
                  `Failed to migrate ${highlight(relative(filesToMigrate[index], base))}: ${result.reason?.message ?? result.reason}`,
                  { prefix: '↳ ' },
                )
              }
            }
          })
          success(
            `Finished template migration for config: ${highlight(relative(config.configFilePath, base))}`,
            { prefix: '↳ ' },
          )
        } else {
          info(
            `No templates found to migrate for config: ${highlight(relative(config.configFilePath, base))}`,
            { prefix: '↳ ' },
          )
        }
      }
    }
  }
  // --- END TEMPLATE MIGRATION ---

  // --- FINAL STATUS CHECK (only run if NOT using --inline-source) ---
  if (!flags['--inline-source']) {
    if (isRepoDirty()) {
      success('Migration complete. Verify the changes and commit them to your repository.')
    } else {
      success('Migration complete. No changes were detected in your repository.')
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
