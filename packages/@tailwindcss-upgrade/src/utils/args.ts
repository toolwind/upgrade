import parse from 'mri'

// Helper function for conditional debug logging
const debugLog = (...args: any[]) => {
  // This function will be marked as pure in tsup config,
  // allowing minifiers to remove calls to it in production builds.
  console.log('[DEBUG args.ts]', ...args)
}

// Definition of the arguments for a command in the CLI.
export type Arg = {
  [key: `--${string}`]: {
    type: keyof Types
    description: string
    alias?: `-${string}`
    default?: Types[keyof Types]
  }
}

// Each argument will have a type and we want to convert the incoming raw string
// based value to the correct type. We can't use pure TypeScript types because
// these don't exist at runtime. Instead, we define a string-based type that
// maps to a TypeScript type.
type Types = {
  boolean: boolean
  number: number | null
  string: string | null
  'string[]': string[] | null
  'boolean | string': boolean | string | null
  'number | string': number | string | null
  'boolean | number': boolean | number | null
  'boolean | number | string': boolean | number | string | null
}

// Convert the `Arg` type to a type that can be used at runtime.
//
// E.g.:
//
// Arg:
// ```
// { '--input': { type: 'string', description: 'Input file', alias: '-i' } }
// ```
//
// Command:
// ```
// ./tailwindcss -i input.css
// ./tailwindcss --input input.css
// ```
//
// Result type:
// ```
// {
//   _: string[],             // All non-flag arguments
//   '--input': string | null // The `--input` flag will be filled with `null`, if the flag is not used.
//                            // The `null` type will not be there if `default` is provided.
// }
// ```
//
// Result runtime object:
// ```
// {
//   _: [],
//   '--input': 'input.css'
// }
// ```
export type Result<T extends Arg> = {
  [K in keyof T]: T[K] extends { type: keyof Types; default?: any }
    ? undefined extends T[K]['default']
      ? Types[T[K]['type']]
      : NonNullable<Types[T[K]['type']]>
    : never
} & {
  // All non-flag arguments
  _: string[]
}

export function args<const T extends Arg>(options: T, argv = process.argv.slice(2)): Result<T> {
  let parsed = parse(argv)
  // --- DEBUG LOG ---
  // console.log(`[DEBUG args.ts] Raw parsed args (from mri): ${JSON.stringify(parsed)}`)
  debugLog('Raw parsed args (from mri):', JSON.stringify(parsed))
  // --- DEBUG LOG ---

  let result: { _: string[]; [key: string]: unknown } = {
    _: parsed._,
  }

  for (let [
    flag,
    { type, alias, default: defaultValue = type === 'boolean' ? false : null },
  ] of Object.entries(options)) {
    result[flag] = defaultValue
    // --- DEBUG LOG ---
    // console.log(
    //   `[DEBUG args.ts] Initializing ${flag} with default: ${JSON.stringify(defaultValue)}`,
    // )
    debugLog(`Initializing ${flag} with default:`, JSON.stringify(defaultValue))
    // --- DEBUG LOG ---

    if (alias) {
      let key = alias.slice(1)
      if (parsed[key] !== undefined) {
        const convertedValue = convert(parsed[key], type)
        // --- DEBUG LOG ---
        // console.log(
        //   `[DEBUG args.ts] Found alias '${key}' for ${flag}. Value: ${JSON.stringify(parsed[key])}. Converted: ${JSON.stringify(convertedValue)}`,
        // )
        debugLog(
          `Found alias '${key}' for ${flag}. Value:`,
          JSON.stringify(parsed[key]),
          'Converted:',
          JSON.stringify(convertedValue),
        )
        // --- DEBUG LOG ---
        result[flag] = convertedValue
      }
    }

    {
      let key = flag.slice(2)
      if (parsed[key] !== undefined) {
        // If alias already set it, this might overwrite, or mri might prioritize one?
        const currentValue = result[flag] // Value potentially set by alias
        const convertedValue = convert(parsed[key], type)
        // --- DEBUG LOG ---
        // console.log(
        //   `[DEBUG args.ts] Found long flag '${key}' for ${flag}. Value: ${JSON.stringify(parsed[key])}. Converted: ${JSON.stringify(convertedValue)}. Current result value: ${JSON.stringify(currentValue)}`,
        // )
        debugLog(
          `Found long flag '${key}' for ${flag}. Value: `,
          JSON.stringify(parsed[key]),
          'Converted:',
          JSON.stringify(convertedValue),
          'Current result value:',
          JSON.stringify(currentValue),
        )
        // --- DEBUG LOG ---
        // Avoid overwriting if alias already provided a valid value? Or let mri's precedence rule?
        // Let's assume mri handles precedence, or the last one wins if both alias and long are somehow present in `parsed`.
        result[flag] = convertedValue
      }
    }
    // --- DEBUG LOG ---
    // console.log(
    //   `[DEBUG args.ts] Final value for ${flag} after checks: ${JSON.stringify(result[flag])}`,
    // )
    debugLog(`Final value for ${flag} after checks:`, JSON.stringify(result[flag]))
    // --- DEBUG LOG ---
  }

  // --- DEBUG LOG ---
  // console.log(`[DEBUG args.ts] Returning final args object: ${JSON.stringify(result)}`)
  debugLog('Returning final args object:', JSON.stringify(result))
  // --- DEBUG LOG ---
  return result as Result<T>
}

// ---

type ArgumentType = string | boolean | string[] | undefined

// Try to convert the raw incoming `value` (which will be a string or a boolean,
// this is coming from `mri`'s parse function'), to the correct type based on
// the `type` of the argument.
function convert<T extends keyof Types>(value: ArgumentType, type: T): Types[T] {
  // --- DEBUG LOG ---
  // console.log(`[DEBUG args.ts] convert called: value=${JSON.stringify(value)}, type=${type}`)
  debugLog(`convert called: value=`, JSON.stringify(value), `type=`, type)
  // --- DEBUG LOG ---

  switch (type) {
    case 'string':
      return convertString(value as string | boolean) as Types[T]
    case 'boolean':
      return convertBoolean(value as string | boolean) as Types[T]
    case 'number':
      return convertNumber(value as string | boolean) as Types[T]
    case 'string[]':
      // --- DEBUG LOG ---
      // console.log('[DEBUG args.ts] Handling type: string[]')
      debugLog('Handling type: string[]')
      // --- DEBUG LOG ---
      if (Array.isArray(value)) {
        const result = value.map(String)
        // console.log(
        //   `[DEBUG args.ts] string[] case: value is array, returning ${JSON.stringify(result)}`,
        // ) // DEBUG
        debugLog(`string[] case: value is array, returning`, JSON.stringify(result))
        return result as Types[T] // Ensure all elements are strings
      }
      // If a single value was passed for an array flag, wrap it in an array
      if (value !== null && value !== undefined && typeof value !== 'boolean') {
        // Check not boolean too
        const result = [String(value)]
        // console.log(
        //   `[DEBUG args.ts] string[] case: value is single, returning ${JSON.stringify(result)}`,
        // ) // DEBUG
        debugLog(`string[] case: value is single, returning`, JSON.stringify(result))
        return result as Types[T]
      }
      // console.log('[DEBUG args.ts] string[] case: value is null/undefined/boolean, returning null') // DEBUG
      debugLog('string[] case: value is null/undefined/boolean, returning null')
      return null as Types[T] // Return null if no value provided (matches other types)
    case 'boolean | string':
      return (convertBoolean(value as string | boolean) ??
        convertString(value as string | boolean)) as Types[T]
    case 'number | string':
      return (convertNumber(value as string | boolean) ??
        convertString(value as string | boolean)) as Types[T]
    case 'boolean | number':
      return (convertBoolean(value as string | boolean) ??
        convertNumber(value as string | boolean)) as Types[T]
    case 'boolean | number | string':
      return (convertBoolean(value as string | boolean) ??
        convertNumber(value as string | boolean) ??
        convertString(value as string | boolean)) as Types[T]
    default:
      // Make the default case exhaustive for type checking
      // let _: never = type // Comment out if 'type' isn't strictly 'keyof Types' at runtime
      // console.error(`[DEBUG args.ts] Unhandled type encountered: ${type}`) // DEBUG
      // Keep actual error for unhandled types, but log debug info
      debugLog(`Unhandled type encountered: ${type}`)
      throw new Error(`Unhandled type: ${type}`)
  }
}

function convertBoolean(value: string | boolean | string[] | undefined): boolean | undefined {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined // Return undefined if not convertible
}

function convertNumber(value: string | boolean | string[] | undefined): number | undefined {
  if (typeof value === 'number') return value // Should generally not happen from mri
  if (typeof value === 'string') {
    let valueAsNumber = Number(value)
    if (!Number.isNaN(valueAsNumber)) return valueAsNumber
  }
  return undefined // Return undefined if not convertible
}

function convertString(value: string | boolean | string[] | undefined): string | undefined {
  if (value === null || value === undefined || typeof value === 'boolean' || Array.isArray(value)) {
    return undefined // Or decide how to handle non-string/non-number primitives
  }
  return `${value}`
}
