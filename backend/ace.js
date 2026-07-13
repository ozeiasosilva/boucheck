/*
|--------------------------------------------------------------------------
| JavaScript entrypoint for running ace commands
|--------------------------------------------------------------------------
|
| The "ace.js" file is the entrypoint for running ace commands.
| It registers the tsx ESM loader so TypeScript files (like adonisrc.ts)
| can be imported at runtime.
|
*/

import { register } from 'tsx/esm/api'

register()

await import('./bin/console.ts')
