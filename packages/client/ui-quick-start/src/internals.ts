/** Test seams for host process facts; production keeps the empty defaults. */

import type { AppLaunchInternals } from './app-launch.ts'

/** Injectable launch facts used by source-level tests before plugin activation. */
export const internals: { launch: AppLaunchInternals } = { launch: {} }
