export type DappledLightSettings = {
  shadowStrength: number
  sunlightRecovery: number
  motionSpeed: number
  deformation: number
  edgeSoftness: number
  depthRegionScale: number
  loopSeconds: number
}

export const DEFAULT_DAPPLED_LIGHT_SETTINGS: DappledLightSettings = {
  shadowStrength: 0.18,
  sunlightRecovery: 0.34,
  motionSpeed: 1,
  deformation: 1,
  edgeSoftness: 1,
  depthRegionScale: 1,
  loopSeconds: 20,
}
