#!/usr/bin/env node

import { globby } from 'globby'
import fs from 'node:fs/promises'
import path from 'node:path'
import postcss from 'postcss'
import { migrateJsConfig } from './codemods/config/migrate-js-config'
import { migratePostCSSConfig } from './codemods/config/migrate-postcss'
import { migratePrettierPlugin } from './codemods/config/migrate-prettier'
import { analyze as analyzeStylesheets } from './codemods/css/analyze'
import { formatNodes } from './codemods/css/format-nodes'
import { linkConfigs as linkConfigsToStylesheets } from './codemods/css/link'
import { migrate as migrateStylesheet } from './codemods/css/migrate'
import { sortBuckets } from './codemods/css/sort-buckets'
import { split as splitStylesheets } from './codemods/css/split'
import { migrate as migrateTemplate } from './codemods/template/migrate'
import { prepareConfig } from './codemods/template/prepare-config'
import { help } from './commands/help'
import { Stylesheet } from './stylesheet'
import { args, type Arg } from './utils/args'
import { isRepoDirty } from './utils/git'
import { hoistStaticGlobParts } from './utils/hoist-static-glob-parts'
import { getPackageVersion } from './utils/package-version'
import { pkg } from './utils/packages'
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
  let base = process.cwd()

  eprintln(header())
  eprintln()

  let cleanup: (() => void)[] = []

  if (!flags['--force']) {
    // Require a clean git directory
    if (isRepoDirty()) {
      error('Git directory is not clean. Please stash or commit your changes before migrating.')
      info(
        `You may use the ${highlight('--force')} flag to silence this warning and perform the migration.`,
      )
      process.exit(1)
    }
  }

  // Require an installed `tailwindcss` version < 4
  // let tailwindVersion = await getPackageVersion('tailwindcss', base)
  // if (tailwindVersion && Number(tailwindVersion.split('.')[0]) !== 3) {
  //   error(
  //     `Tailwind CSS v${tailwindVersion} found. The migration tool can only be run on v3 projects.`,
  //   )
  //   process.exit(1)
  // }

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
    info(`  npx @toolwind/upgrade --configs **/tailwind.config.{js,ts,cjs}`)
    process.exit(1)
  }
  // --- END VALIDATION ---


  // --- DETERMINE CONFIG PATHS TO PROCESS ---
  let configPathsToProcess: string[] = [];
  if (hasSingleConfig) {
    configPathsToProcess.push(flags['--config']!); // Add the single path
  } else {
    configPathsToProcess = flags['--configs']!; // Use the array of paths
  }
  // --- END DETERMINING PATHS ---


  // Directly process configs using the determined paths
  let explicitConfigs: Awaited<ReturnType<typeof prepareConfig>>[] = []
  info('Loading configuration files…')
  // Use configPathsToProcess in the loop
  for (let configPath of configPathsToProcess) {
    try {
      // Resolve relative paths from the current working directory
      let absoluteConfigPath = path.resolve(base, configPath)
      let config = await prepareConfig(absoluteConfigPath, { base })
      explicitConfigs.push(config)
      success(`Loaded config: ${highlight(relative(absoluteConfigPath, base))}`, { prefix: '↳ ' })
    } catch (e: any) {
      error(`Failed to load config ${highlight(configPath)}: ${e?.message ?? e}`, { prefix: '↳ ' })
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

  if (isRepoDirty()) {
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