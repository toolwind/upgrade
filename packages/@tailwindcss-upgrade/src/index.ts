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
} satisfies Arg
const flags = args(options)

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
    info(`Detected repository root: ${repoRoot}`)
  } catch (gitError) {
    info(
      `Warning: Could not determine Git repository root (maybe not a git repo or git is not installed).`,
    )
    info(`Using current directory (${initialCwd}) as base for resolving paths and globs.`)
    repoRoot = initialCwd
  }
  const base = repoRoot
  // --- END DETECT REPO ROOT ---

  eprintln(header())
  eprintln()

  // --- GIT DIRTY CHECK ---
  if (!flags['--force']) {
    let repoIsDirty = false
    try {
      repoIsDirty = isRepoDirty() // Pass base if isRepoDirty requires it
    } catch (dirtyCheckError) {
      info(`Warning: Could not perform Git dirty check: ${dirtyCheckError}`)
    }
    if (repoIsDirty) {
      error('Git directory is not clean. Please stash or commit your changes before migrating.')
      info(`You may use the ${highlight('--force')} flag to silence this warning...`)
      process.exit(1)
    }
  }
  // --- END GIT DIRTY CHECK ---

  // --- VALIDATION FOR CONFIG FLAGS ---
  // Check against null, the actual default value when flag is not provided
  const hasSingleConfig = flags['--config'] !== null
  // Check against null first before checking length
  const hasMultipleConfigs = flags['--configs'] !== null && flags['--configs'].length > 0
  const hasSourceFlag = flags['--source'] !== null && flags['--source'].length > 0
  const hasInlineSourceFlag = flags['--inline-source'] !== null

  if (hasSingleConfig && hasMultipleConfigs) {
    error(
      'Please use either --config (for a single file) or --configs (for multiple files), not both.',
    )
    process.exit(1)
  }

  // Check if neither config flag was provided
  if (!hasSingleConfig && !hasMultipleConfigs) {
    error('Please provide configuration file path(s) using either --config or --configs.')
    info(`Examples:`)
    info(`  npx @toolwind/upgrade --config path/to/tailwind.config.js`)
    info(`  npx @toolwind/upgrade --configs '**/tailwind.config.{js,ts,cjs}'`)
    process.exit(1)
  }

  // --- NEW VALIDATION for --source and --inline-source ---
  if (hasSourceFlag && hasInlineSourceFlag) {
    error(
      'Please use either --source (to scan files) or --inline-source (to migrate a string), not both.',
    )
    process.exit(1)
  }

  if (hasInlineSourceFlag && !hasSingleConfig && !hasMultipleConfigs) {
    error(
      'The --inline-source flag requires a configuration file specified with --config or --configs.',
    )
    process.exit(1)
  }
  // --- END NEW VALIDATION ---

  // --- DETERMINE CONFIG INPUTS ---
  let configInputs: string[] = []
  if (hasSingleConfig) {
    configInputs.push(flags['--config']!)
  } else {
    configInputs = flags['--configs']!
  }
  // --- END DETERMINING INPUTS ---

  // --- RESOLVE CONFIG PATHS FROM REPO ROOT (base) ---
  let configPathsToProcess = new Set<string>()
  info('Resolving configuration file paths/globs relative to base directory…')
  for (let inputPatternOrPath of configInputs) {
    const isGlob = /[*?{}[\]]/.test(inputPatternOrPath) || inputPatternOrPath.includes('**')
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
            '**/dev-env/root/reporoot/**',
            '**/common/temp/pnpm-store/**',
          ],
        })
        if (foundFiles.length > 0) {
          foundFiles.forEach((file) => configPathsToProcess.add(file))
          info(
            `Glob '${inputPatternOrPath}' resolved to: ${foundFiles.map((f) => highlight(relative(f, base))).join(', ')}`,
            { prefix: '↳ ' },
          )
        } else {
          info(`Glob '${inputPatternOrPath}' did not match any files.`, { prefix: '↳ ' })
        }
      } catch (e: any) {
        if (e?.code === 'ENAMETOOLONG') {
          error(
            `Error resolving glob '${inputPatternOrPath}': Path became too long. Check ignore patterns. Error: ${e?.message ?? e}`,
            { prefix: '↳ ' },
          )
        } else {
          error(`Error resolving glob '${inputPatternOrPath}': ${e?.message ?? e}`, {
            prefix: '↳ ',
          })
        }
      }
    } else {
      const absolutePath = path.resolve(base, inputPatternOrPath)
      try {
        await fs.access(absolutePath)
        configPathsToProcess.add(absolutePath)
        info(`Resolved specific path: ${highlight(relative(absolutePath, base))}`, { prefix: '↳ ' })
      } catch {
        error(
          `Specified configuration file not found: ${highlight(inputPatternOrPath)} (resolved relative to ${base})`,
          { prefix: '↳ ' },
        )
      }
    }
  }
  // --- END RESOLVING PATHS ---

  if (configPathsToProcess.size === 0) {
    error('No configuration files found or resolved from the provided inputs. Aborting.')
    process.exit(1)
  }

  // --- THIS SECTION IS INTENTIONALLY EMPTY ---
  // We ensure that NO logic related to finding/loading/parsing/linking CSS files
  // runs before we explicitly load the configurations below.
  // Any code that was here previously (like searching for *.css with globby,
  // using Stylesheet.load, or linkConfigsToStylesheets) is removed/bypassed.
  // --- END INTENTIONALLY EMPTY SECTION ---

  // --- LOAD CONFIGS DIRECTLY ---
  let explicitConfigs: Awaited<ReturnType<typeof prepareConfig>>[] = []
  info('Loading configuration files…')
  for (let absoluteConfigPath of configPathsToProcess) {
    const relativeConfigPath = relative(absoluteConfigPath, base) // Get relative path for logging
    try {
      // Pass repoRoot (base) to prepareConfig
      let config = await prepareConfig(absoluteConfigPath, { base })
      explicitConfigs.push(config)
      success(`Loaded config: ${highlight(relativeConfigPath)}`, { prefix: '↳ ' })
    } catch (e: any) {
      // --- MODIFIED ERROR LOGGING ---
      error(`Failed to load config ${highlight(relativeConfigPath)}: ${e?.message ?? e}`, {
        prefix: '↳ ',
      })
      // Add more detail to the console for debugging
      console.error(`[DEBUG] Full error details for ${relativeConfigPath}:`)
      console.error(e)
      // Continue processing other files, but note the failure
      // --- END MODIFIED ERROR LOGGING ---
    }
  }
  // Check if *any* configs loaded successfully before proceeding
  if (explicitConfigs.length === 0) {
    error('No valid configuration files could be loaded successfully. Aborting.') // Adjusted message
    process.exit(1)
  }
  // --- END LOAD CONFIGS DIRECTLY ---

  // --- TEMPLATE MIGRATION ---
  if (explicitConfigs.length > 0) {
    // Check if we are doing inline migration
    if (flags['--inline-source']) {
      info('Migrating provided inline source string...')
      const inlineSource = flags['--inline-source'] as string

      for (let config of explicitConfigs) {
        const relativeConfigPath = relative(config.configFilePath, base)
        try {
          // We assume migrateString exists and returns the migrated string
          const migratedString = await migrateString(
            config.designSystem,
            config.userConfig,
            inlineSource,
            flags['--inline-source-extension'],
          )

          // Print the result clearly associated with its config
          eprintln() // Add spacing
          info(`Result using config ${highlight(relativeConfigPath)}:`)
          console.log(migratedString) // Print the raw migrated string to stdout
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
      // Exit after printing inline results, no file changes to check
      success('Inline source migration complete.')
      process.exit(0)
    } else {
      info('Migrating templates based on loaded configurations and source patterns…')
      for (let config of explicitConfigs) {
        let templatesForThisConfig = new Set<string>()
        info(`Finding templates for config: ${highlight(relative(config.configFilePath, base))}`)

        // Determine source patterns: Use --source flag if provided, otherwise use config.sources
        const sourcePatternsInput =
          flags['--source'] ?? config.sources.flatMap((entry) => hoistStaticGlobParts(entry))

        for (let globEntry of sourcePatternsInput) {
          // Adjust globEntry type check if necessary, assuming string[] from flag or {pattern: string, base: string}[] from config
          let pattern: string
          let cwd: string
          if (typeof globEntry === 'string') {
            pattern = globEntry // Pattern from --source flag
            cwd = base // Assume patterns from flag are relative to the base (repo root)
          } else {
            pattern = globEntry.pattern // Pattern from sourcePatternsInput
            cwd = globEntry.base
          }

          let files = await globby([pattern], {
            absolute: true,
            gitignore: true,
            cwd: cwd,
            ignore: ['**/node_modules/**', '**/dist/**', '**/.*/**'],
          })
          files.forEach((file) => templatesForThisConfig.add(file))
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

  // --- COMMENTED OUT OTHER MIGRATIONS ---
  /*
  { // PostCSS config migration - Skip
     // await migratePostCSSConfig(base)
  }
  { // Prettier plugin migration - Skip
     // await migratePrettierPlugin(base)
  }
  { // Tailwind CSS dependency upgrade - Skip
     // try { await pkg(base).add(['tailwindcss@latest']) } catch {}
  }
  { // Cleanup - Skip
     // await Promise.allSettled(cleanup.map((fn) => fn())) // cleanup array is also removed
  }
  */
  // --- END COMMENTED OUT OTHER MIGRATIONS ---

  // --- FINAL STATUS CHECK (only run if NOT using --inline-source) ---
  if (!flags['--inline-source']) {
    if (isRepoDirty()) {
      // Pass base if needed
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
