#!/usr/bin/env node

import { globby } from 'globby'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { migrateString, migrate as migrateTemplate } from './codemods/template/migrate'
import { prepareConfig } from './codemods/template/prepare-config'
import { help } from './commands/help'
import { args, type Arg } from './utils/args'
import { isRepoDirty } from './utils/git'
import { hoistStaticGlobParts } from './utils/hoist-static-glob-parts'
import { eprintln, error, header, highlight, info, relative, success } from './utils/renderer'

const options = {
  '--config': {
    type: 'string[]',
    description: 'Paths or globs for configuration files',
    alias: '-c',
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
  '--inline-extension': {
    type: 'string',
    description: 'Provide the extension of the inline source file (e.g. "html")',
    alias: '-x',
  },
  '--quiet': {
    type: 'boolean',
    description: 'Suppress all informational logs; only output results or errors.',
    alias: '-q',
  },
  '--debug': {
    type: 'boolean',
    description: 'Enable debug mode',
  },
} satisfies Arg
const flags = args(options)

if (flags['--help']) {
  help({
    usage: [
      'npx @toolwind/upgrade --config <path|glob>...',
      'npx @toolwind/upgrade --config <path|glob>... --source <path|glob>...',
      'npx @toolwind/upgrade --config <path|glob>... --inline-source "<string>"',
      'npx @toolwind/upgrade --config <path|glob>... --inline-source "<string>" --inline-extension pug',
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
    // Log repo detection only if not quiet
    if (!flags['--quiet']) info(`Detected repository root: ${repoRoot}`)
  } catch (gitError) {
    // Log warning only if not quiet
    if (!flags['--quiet']) {
    info(
      `Warning: Could not determine Git repository root (maybe not a git repo or git is not installed).`,
    )
    info(`Using current directory (${initialCwd}) as base for resolving paths and globs.`)
    }
    repoRoot = initialCwd
  }
  const base = repoRoot
  // --- END DETECT REPO ROOT ---

  // Print header only if not quiet
  if (!flags['--quiet']) {
  eprintln(header())
  eprintln()
  }

  // --- Basic Flag Validation --- // (Errors should always print)
  // Check against null and empty array for the config flag
  const hasConfigFlag = flags['--config'] !== null && flags['--config']!.length > 0
  const hasSourceFlag = flags['--source'] !== null && flags['--source'].length > 0
  const hasInlineSourceFlag = flags['--inline-source'] !== null

  // Removed check for both flags

  // Check if the config flag was provided
  if (!hasConfigFlag) {
    error('Please provide configuration file path(s) using --config.')
    // Info examples only if not quiet
    if (!flags['--quiet']) {
    info(`Examples:`)
    info(`  npx @toolwind/upgrade --config path/to/tailwind.config.js`)
      info(`  npx @toolwind/upgrade --config '**/tailwind.config.{js,ts,cjs}'`)
    }
    process.exit(1)
  }
  if (hasSourceFlag && hasInlineSourceFlag) {
    error('Please use either --source or --inline-source, not both.')
    process.exit(1)
  }
  if (hasInlineSourceFlag && !hasConfigFlag) {
    // Inline source still requires a config
    error('The --inline-source flag requires a configuration file specified with --config.')
    process.exit(1)
  }
  // --- End Basic Flag Validation ---

  // Git dirty check (Log warning/info only if not quiet)
  if (!flags['--force']) {
    let repoIsDirty = false
    try {
      repoIsDirty = isRepoDirty()
    } catch (dirtyCheckError) {
      if (!flags['--quiet']) {
        info(`Warning: Could not perform Git dirty check: ${dirtyCheckError}`)
      }
    }
    if (repoIsDirty) {
      // Error should always print
      error('Git directory is not clean. Please stash or commit your changes before migrating.')
      // Info only if not quiet
      if (!flags['--quiet']) {
        info(`You may use the ${highlight('--force')} flag to silence this warning...`)
      }
      process.exit(1)
    }
  }

  // --- DETERMINE/RESOLVE/LOAD CONFIGS ---
  // Directly use the potentially array value from flags['--config']
  const configInputs = flags['--config']!

  let configPathsToProcess = new Set<string>()

  // Log resolving start only if not quiet
  if (!flags['--quiet']) {
  info('Resolving configuration file paths/globs relative to base directory…')
  }
  // Iterate directly over the configInputs array
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
            '**/dev-env/root/reporoot/**',
            '**/common/temp/pnpm-store/**',
          ],
        })
        if (foundFiles.length > 0) {
          foundFiles.forEach((file) => configPathsToProcess.add(file))
          // Log glob results only if not quiet
          if (!flags['--quiet']) {
          info(
            `Glob '${inputPatternOrPath}' resolved to: ${foundFiles.map((f) => highlight(relative(f, base))).join(', ')}`,
            { prefix: '↳ ' },
          )
          }
        } else {
          // Log no match only if not quiet
          if (!flags['--quiet']) {
          info(`Glob '${inputPatternOrPath}' did not match any files.`, { prefix: '↳ ' })
          }
        }
      } catch (e: any) {
        // Always log errors
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
        await fsPromises.access(absolutePath)
        configPathsToProcess.add(absolutePath)
        // Log specific path only if not quiet
        if (!flags['--quiet']) {
          info(`Resolved specific path: ${highlight(relative(absolutePath, base))}`, {
            prefix: '↳ ',
          })
        }
      } catch {
        // Always log errors
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

  // Log loading start only if not quiet
  if (!flags['--quiet']) {
  info('Loading configuration files…')
  }
  for (let absoluteConfigPath of configPathsToProcess) {
    const relativeConfigPath = relative(absoluteConfigPath, base)
    try {
      let config = await prepareConfig(absoluteConfigPath, { base })
      explicitConfigs.push(config)
      // Log success only if not quiet
      if (!flags['--quiet']) {
      success(`Loaded config: ${highlight(relativeConfigPath)}`, { prefix: '↳ ' })
      }
    } catch (e: any) {
      // Always log errors
      error(`Failed to load config ${highlight(relativeConfigPath)}: ${e?.message ?? e}`, {
        prefix: '↳ ',
      })
      // Only log full debug details if debug flag is also set
      if (flags['--debug']) {
      console.error(`[DEBUG] Full error details for ${relativeConfigPath}:`)
      console.error(e)
      }
    }
  }

  if (explicitConfigs.length === 0) {
    error('No valid configuration files could be loaded successfully. Aborting.')
    process.exit(1)
  }
  // --- END CONFIG LOADING ---

  // --- TEMPLATE MIGRATION --- >> Check for inline *after* loading configs << ---
    if (flags['--inline-source']) {
    const inlineSource = flags['--inline-source'] as string

    // Log start only if not quiet
    if (!flags['--quiet']) {
      info('Migrating provided inline source string...')
    }
      for (let config of explicitConfigs) {
        const relativeConfigPath = relative(config.configFilePath, base)
        try {
          const migratedString = await migrateString(
            config.designSystem,
            config.userConfig,
            inlineSource,
          flags['--inline-extension'],
          )
        // Output based on quiet flag
        if (flags['--quiet']) {
          // Use synchronous write to ensure output before exit
          fs.writeSync(process.stdout.fd, migratedString + '\n')
          process.exit(0)
        } else {
          eprintln() // Add spacing
          info(`Result using config ${highlight(relativeConfigPath)}:`)
          console.log(migratedString) // Output with newline and context
          eprintln() // Add spacing
          // Need to exit here too for the non-quiet case
          process.exit(0)
        }
        } catch (e: any) {
        // Always print errors
          error(
            `Failed to migrate inline source using config ${highlight(relativeConfigPath)}: ${e?.message ?? e}`,
            { prefix: '↳ ' },
          )
        // Only log full debug details if debug flag is also set
        if (flags['--debug']) {
          console.error(
            `[DEBUG] Full error details for inline migration with ${relativeConfigPath}:`,
          )
          console.error(e)
        }
      }
    }
    // Log completion only if not quiet
    if (!flags['--quiet']) {
      success('Inline source migration complete.')
    }
    process.exit(0) // Exit after processing all configs
  }
  // --- FILE MIGRATION --- (if not inline)
  else {
    // Log start only if not quiet
    if (!flags['--quiet']) {
      info('Migrating templates based on loaded configurations and source patterns…')
    }
      for (let config of explicitConfigs) {
        let templatesForThisConfig = new Set<string>()
      // Log which config we are processing only if not quiet
      if (!flags['--quiet']) {
        info(`Finding templates for config: ${highlight(relative(config.configFilePath, base))}`)
      }

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
              '**/common/temp/pnpm-store/**',
            ],
          })
          files.forEach((file) => templatesForThisConfig.add(file))
        } catch (e: any) {
          // Always log errors
          if (e?.code === 'ENAMETOOLONG') {
            error(
              `Error scanning template source '${pattern}': Path became too long. Consider adding ignores to your .gitignore. Error: ${e?.message ?? e}`,
              { prefix: '↳ ' },
            )
          } else {
            error(`Error scanning template source '${pattern}': ${e?.message ?? e}`, {
              prefix: '↳ ',
            })
          }
        }
        }

        let filesToMigrate = Array.from(templatesForThisConfig)
        filesToMigrate.sort()

        if (filesToMigrate.length > 0) {
        // Log count only if not quiet
        if (!flags['--quiet']) {
          info(
            `Migrating ${filesToMigrate.length} template(s) for ${highlight(relative(config.configFilePath, base))}...`,
            { prefix: '↳ ' },
          )
        }
          let migrationResults = await Promise.allSettled(
            filesToMigrate.map((file) =>
              migrateTemplate(config.designSystem, config.userConfig, file),
            ),
          )
          migrationResults.forEach((result, index) => {
            if (result.status === 'rejected') {
            // Always log errors
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
        // Log success only if not quiet
        if (!flags['--quiet']) {
          success(
            `Finished template migration for config: ${highlight(relative(config.configFilePath, base))}`,
            { prefix: '↳ ' },
          )
        }
        } else {
        // Log no files found only if not quiet
        if (!flags['--quiet']) {
          info(
            `No templates found to migrate for config: ${highlight(relative(config.configFilePath, base))}`,
            { prefix: '↳ ' },
          )
        }
      }
    }
  }

  // --- FINAL STATUS CHECK (only run if NOT using --inline-source) ---
  if (!flags['--inline-source']) {
    // Log final status only if not quiet
    if (!flags['--quiet']) {
    if (isRepoDirty()) {
      success('Migration complete. Verify the changes and commit them to your repository.')
    } else {
      success('Migration complete. No changes were detected in your repository.')
      }
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
