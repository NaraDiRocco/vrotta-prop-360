/** Convenciones de path dentro del bucket R2. Un único lugar para no divergir. */
export const r2Paths = {
  base: (tenant: string, project: string, version: number) => `t/${tenant}/${project}/v${version}`,
  tourJson: (tenant: string, project: string, version: number) =>
    `${r2Paths.base(tenant, project, version)}/tour.json`,
  availabilityJson: (tenant: string, project: string, version: number) =>
    `${r2Paths.base(tenant, project, version)}/availability.json`,
  /** Shell HTML del visor para esa versión (assets de apps/viewer publicados junto con la data). */
  indexHtml: (tenant: string, project: string, version: number) =>
    `${r2Paths.base(tenant, project, version)}/index.html`,
  /**
   * Tiles: viven bajo `${base}/tiles/...` pero el Worker NUNCA los lee ni los
   * sirve — el navegador los pide directo al dominio público de R2. Esta
   * entrada es sólo documentación del layout para quien arme el publish.
   */
  tilesPrefix: (tenant: string, project: string, version: number) =>
    `${r2Paths.base(tenant, project, version)}/tiles/`,
};
