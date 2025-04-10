#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { globby } from 'globby'
import fs from 'node:fs/promises'
import path from 'node:path'
import { migrate as migrateTemplate } from './codemods/template/migrate'
import { prepareConfig } from './codemods/template/prepare-config'
import { help } from './commands/help'
import { args, type Arg } from './utils/args'
import { isRepoDirty } from './utils/git'
import { hoistStaticGlobParts } from './utils/hoist-static-glob-parts'
import { eprintln, error, header, highlight, info, relative, success } from './utils/renderer'

const options = {
  '--config': { type: 'string', description: 'Path to a single configuration file', alias: '-c' },
  '--configs': { type: 'string[]', description: 'Paths or globs for multiple configuration files', alias: '-C' },
  '--help': { type: 'boolean', description: 'Display usage information', alias: '-h' },
  '--force': { type: 'boolean', description: 'Force the migration', alias: '-f' },
  '--version': { type: 'boolean', description: 'Display the version number', alias: '-v' },
} satisfies Arg
const flags = args(options)

if (flags['--help']) {
  help({
    usage: [
      'npx @toolwind/upgrade --config <path>',
      'npx @toolwind/upgrade --configs <path|glob>...',
    ],
    options,
  })
  process.exit(0)
}

async function run() {
  const initialCwd = process.cwd();
  let repoRoot: string | null = null;

  // --- DETECT REPO ROOT USING GIT ---
  try {
    // Execute git command, trim whitespace from output
    repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: 'pipe' }).trim();
    info(`Detected repository root: ${repoRoot}`);
  } catch (gitError) {
    // Handle cases where git isn't installed or it's not a repo
    info(`Warning: Could not determine Git repository root (maybe not a git repo or git is not installed).`);
    info(`Using current directory (${initialCwd}) as base for resolving paths and globs.`);
    repoRoot = initialCwd; // Fallback to initial CWD
  }
  // Use the detected repo root as the base for all operations
  const base = repoRoot;
  // --- END DETECT REPO ROOT ---

  eprintln(header())
  eprintln()

  // --- GIT DIRTY CHECK ---
  // isRepoDirty likely needs to be run where the .git dir is expected,
  // or it might internally find the root. If it fails, provide the base path.
  if (!flags['--force']) {
    let repoIsDirty = false;
    try {
      // Try running isRepoDirty, potentially passing the determined root
      repoIsDirty = isRepoDirty(); // Pass base if isRepoDirty requires it
    } catch (dirtyCheckError) {
      // Handle cases where isRepoDirty fails (e.g., no git repo after fallback)
      info(`Warning: Could not perform Git dirty check: ${dirtyCheckError}`);
      // Decide if you want to exit or continue without the check
      // process.exit(1);
    }

    if (repoIsDirty) {
      error('Git directory is not clean. Please stash or commit your changes before migrating.')
      info(
        `You may use the ${highlight('--force')} flag to silence this warning and perform the migration.`,
      )
      process.exit(1)
    }
  }
  // --- END GIT DIRTY CHECK ---


  // --- VALIDATION FOR CONFIG FLAGS ---
  const hasSingleConfig = flags['--config'] !== undefined;
  const hasMultipleConfigs = flags['--configs'] !== undefined && flags['--configs'].length > 0;

  if (hasSingleConfig && hasMultipleConfigs) {
    error('Please use either --config (for a single file) or --configs (for multiple files), not both.')
    process.exit(1);
  }

  if (!hasSingleConfig && !hasMultipleConfigs) {
    error('Please provide configuration file path(s) using either --config or --configs.')
    info(`Examples:`)
    info(`  npx @toolwind/upgrade --config path/to/tailwind.config.js`)
    info(`  npx @toolwind/upgrade --configs '**/tailwind.config.{js,ts,cjs}'`)
    process.exit(1)
  }
  // --- END VALIDATION ---


  // --- DETERMINE CONFIG PATHS TO PROCESS ---
  let configInputs: string[] = [];
  if (hasSingleConfig) {
    configInputs.push(flags['--config']!);
  } else {
    configInputs = flags['--configs']!;
  }
  // --- END DETERMINING PATHS ---


  // --- RESOLVE CONFIG PATHS FROM REPO ROOT (base) ---
  let configPathsToProcess = new Set<string>(); // Use Set for uniqueness
  info('Resolving configuration file paths/globs relative to base directory…');
  for (let inputPatternOrPath of configInputs) {
      const isGlob = /[*?{}[\]]/.test(inputPatternOrPath) || inputPatternOrPath.includes('**');

      if (isGlob) {
          try {
              // Use globby internally, searching from the repo root (base)
              const foundFiles = await globby(inputPatternOrPath, {
                  cwd: base, // <--- Search relative to repo root (base)
                  absolute: true,
                  onlyFiles: true,
                  gitignore: true,
                  ignore: ['**/node_modules/**'],
              });
              if (foundFiles.length > 0) {
                foundFiles.forEach(file => configPathsToProcess.add(file));
                info(`Glob '${inputPatternOrPath}' resolved to: ${foundFiles.map(f => highlight(relative(f, base))).join(', ')}`, { prefix: '↳ ' });
              } else {
                info(`Glob '${inputPatternOrPath}' did not match any files.`, { prefix: '↳ ' });
              }
          } catch (e: any) {
              error(`Error resolving glob '${inputPatternOrPath}': ${e?.message ?? e}`, { prefix: '↳ ' })
          }
      } else {
          // Treat as a specific path relative to repo root (base)
          const absolutePath = path.resolve(base, inputPatternOrPath); // <--- Resolve relative to base
          try {
            await fs.access(absolutePath);
            configPathsToProcess.add(absolutePath);
            info(`Resolved specific path: ${highlight(relative(absolutePath, base))}`, { prefix: '↳ ' });
          } catch {
            error(`Specified configuration file not found: ${highlight(inputPatternOrPath)} (resolved relative to ${base})`, { prefix: '↳ ' });
          }
      }
  }
  // --- END RESOLVING PATHS ---

  if (configPathsToProcess.size === 0) {
    error('No configuration files found or resolved from the provided inputs. Aborting.');
    process.exit(1);
  }

  // Directly process resolved absolute config paths
  let explicitConfigs: Awaited<ReturnType<typeof prepareConfig>>[] = []
  info('Loading configuration files…')
  for (let absoluteConfigPath of configPathsToProcess) {
      try {
          // Pass repoRoot (base) to prepareConfig
          let config = await prepareConfig(absoluteConfigPath, { base }); // <--- Pass base to prepareConfig
          explicitConfigs.push(config);
          success(`Loaded config: ${highlight(relative(absoluteConfigPath, base))}`, { prefix: '↳ ' })
      } catch (e: any) {
          error(`Failed to load config ${highlight(relative(absoluteConfigPath, base))}: ${e?.message ?? e}`, { prefix: '↳ ' })
      }
  }

  if (explicitConfigs.length === 0) {
    error('No valid configuration files were loaded. Aborting.')
    process.exit(1)
  }

  // Migrate source files for each explicitly loaded config
  if (explicitConfigs.length > 0) {
    info('Migrating templates based on loaded configurations…')
  }
  {
    // Template migrations
    for (let config of explicitConfigs) { // Iterate over explicitly loaded configs
      let templatesForThisConfig = new Set<string>()
      info(`Finding templates for config: ${highlight(relative(config.configFilePath, base))}`)
      for (let globEntry of config.sources.flatMap((entry) => hoistStaticGlobParts(entry))) {
        let files = await globby([globEntry.pattern], {
          absolute: true,
          gitignore: true,
          cwd: globEntry.base,
        })

        for (let file of files) {
          templatesForThisConfig.add(file)
        }
      }

      let filesToMigrate = Array.from(templatesForThisConfig)
      filesToMigrate.sort()

      if (filesToMigrate.length > 0) {
        info(`Migrating ${filesToMigrate.length} template(s) for ${highlight(relative(config.configFilePath, base))}...`, { prefix: '↳ ' })
        // Migrate each file
        let migrationResults = await Promise.allSettled(
          filesToMigrate.map((file) => migrateTemplate(config.designSystem, config.userConfig, file)),
        )

        // Log any errors during template migration
        migrationResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            error(`Failed to migrate ${highlight(relative(filesToMigrate[index], base))}: ${result.reason?.message ?? result.reason}`, { prefix: '↳ ' })
          }
        })

        success(
          `Finished template migration for config: ${highlight(relative(config.configFilePath, base))}`,
          { prefix: '↳ ' }
        )
      } else {
        info(`No templates found to migrate for config: ${highlight(relative(config.configFilePath, base))}`, { prefix: '↳ ' })
      }
    }
  }

  if (isRepoDirty(base)) {
    success('Migration complete. Verify the changes and commit them to your repository.')
  } else {
    success('Migration complete. No changes were detected in your repository.')
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })