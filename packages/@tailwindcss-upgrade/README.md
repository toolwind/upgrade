<p align="center">
  <a href="https://tailwindcss.com" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/toolwind/upgrade/HEAD/.github/logo-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/toolwind/upgrade/HEAD/.github/logo-light.svg">
      <img alt="Tailwind CSS" src="https://raw.githubusercontent.com/toolwind/upgrade/HEAD/.github/logo-light.svg" width="350" height="70" style="max-width: 100%;">
    </picture>
  </a>
  <br />
  <small>~ @toolwind/upgrade ~</small>
</p>

<p align="center">
  <nobr>A custom Tailwind CSS v3 → v4 upgrade tool <wbr>focused <strong>only</strong> on migrating utility classes.</nobr>
</p>


<p align="center">
    <a href="https://github.com/toolwind/upgrade/actions"><img src="https://img.shields.io/github/actions/workflow/status/toolwind/upgrade/ci.yml?branch=next" alt="Build Status"></a>
    <a href="https://www.npmjs.com/package/@toolwind/upgrade"><img src="https://img.shields.io/npm/dt/@toolwind/upgrade.svg" alt="Total Downloads"></a>
    <a href="https://github.com/toolwind/upgrade/releases"><img src="https://img.shields.io/npm/v/@toolwind/upgrade.svg" alt="Latest Release"></a>
    <a href="https://github.com/toolwind/upgrade/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/@toolwind/upgrade.svg" alt="License"></a>
</p>

---

This tool assists in upgrading Tailwind CSS v3 projects to v4 by scanning for utility classes and updating them based on a provided Tailwind configuration file.

This is a fork of the official <a href="https://www.npmjs.com/package/@tailwindcss/upgrade">@tailwindcss/upgrade</a> package, with some key differentiators, listed below.

Unlike the original Tailwind upgrade tool, this version **only migrates utility classes**. It does **not** attempt to migrate Tailwind or PostCSS configurations, or automatically install or update any dependencies.

<ul>
  <li><strong>🎯&nbsp; Focus on Utility Classes</strong><br/><small>This tool exclusively targets the migration of Tailwind CSS utility classes found based on your configuration or provided inputs.</small></li><br>
  <li><strong>🛡️&nbsp; Zero Side Effects</strong><br/><small>This tool focuses solely on utility class migration, with…</small><br><br>
    <ul>
      <li>⛔️&nbsp; <strong>No Config Changes</strong><br/><small>Your <code>tailwind.config.js</code> and related configuration files remain untouched.</small></li><br>
      <li>📦&nbsp; <strong>No Package Updates</strong><br/><small>Dependencies like <code>tailwindcss</code>, <code>@tailwindcss/postcss</code>, and plugins like <code>autoprefixer</code> are left for you to manage as you see fit. See the official <a href="https://tailwindcss.com/docs/upgrade-guide" target="_blank">upgrade guide</a>.</small></li><br>
    </ul>
  </li>
  <li>🧩&nbsp;
    <strong> Flexible Input</strong><ul><br>
      <li>🧍&nbsp; <strong>Single Config</strong><br/><small>Use <code>--config</code> (<code>-c</code>) to specify a single Tailwind configuration file to use for migration.</small></li><br>
      <li>🧑‍🤝‍🧑&nbsp; <strong>Multiple Configs</strong><br/><small>Use <code>--configs</code> (<code>-C</code>) to specify multiple configuration files or glob patterns for batch migrations.</small></li><br>
      <li>🔍&nbsp; <strong>Custom Source Patterns</strong><br/><small>Use the <code>--source</code> (<code>-s</code>) flag to override the <code>content</code> array and specify exact file paths or glob patterns to scan for utilities.</small></li><br>
      <li>💻&nbsp; <strong>Direct String Migration</strong><br/><small>Use the <code>--inline-source</code> (<code>-i</code>) flag to migrate a string containing utility classes directly from the command line without scanning files.</small></li><br>
    </ul>
  </li>
</ul>

</small>

## Usage

You can run the tool using `npx @toolwind/upgrade [OPTIONS]`:

```bash
# Basic usage with a single config file
npx @toolwind/upgrade --config path/to/tailwind.config.js

# Basic usage with multiple config files (using glob)
npx @toolwind/upgrade --configs '**/tailwind.config.{js,ts,cjs}'

# Override template file scanning locations (ignores config's `content` array)
npx @toolwind/upgrade --config <config_path> --source 'src/**/*.html' 'app/**/*.tsx'

# Migrate a string of utility classes directly (outputs to console)
npx @toolwind/upgrade --config <config_path> --inline-source '<div class="bg-blue-500 hover:!bg-red-600">...</div>'

# Migrate a string, specifying the source type (e.g., for Pug, Haml parsing)
npx @toolwind/upgrade --config <config_path> --inline-source 'button.bg-blue-500 Click' -x pug
```

## Options

| Flag                        | Alias | Type       | Description                                                              |
| :-------------------------- | :---- | :--------- | :-------------------------------------------------------------------     |
| `--config`                  | `-c`  | `string`   | Path to a single configuration file                                      |
| `--configs`                 | `-C`  | `string[]` | Paths or globs for multiple configs (e.g. `tailwind.config.{js,ts,cjs}`) |
| `--source`                  | `-s`  | `string[]` | Override template source patterns/globs (ignores config `content`)       |
| `--inline-source`           | `-i`  | `string`   | Provide utility classes as a string for direct migration (no files)      |
| `--inline-source-extension` | `-x`  | `string`   | Provide the extension of the inline source file (e.g. "html", "pug")     |
| `--force`                   | `-f`  | `boolean`  | Force the migration (skips git dirty check)                              |
| `--help`                    | `-h`  | `boolean`  | Display usage information                                                |

## Contributing

Feel free to contribute by opening issues or submitting pull requests on GitHub. Any contributions that help improve this tool and make the Tailwind CSS v4 migration process smoother for everyone are welcome.
