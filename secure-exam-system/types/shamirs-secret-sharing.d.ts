// Type declaration for shamirs-secret-sharing (no @types package available)
declare module "shamirs-secret-sharing" {
  function split(
    secret: Buffer,
    options: { shares: number; threshold: number }
  ): Buffer[];

  function combine(shares: Buffer[]): Buffer;
}
