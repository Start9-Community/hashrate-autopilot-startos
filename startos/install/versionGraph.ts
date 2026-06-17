import { VersionGraph } from '@start9labs/start-sdk'
import { v1_10_0_0, v1_11_0_0, v1_12_0_0, v1_13_0_0, v1_14_0_0, v1_15_0_0 } from './versions'

export const versionGraph = VersionGraph.of({
  current: v1_15_0_0,
  other: [v1_10_0_0, v1_11_0_0, v1_12_0_0, v1_13_0_0, v1_14_0_0],
})
