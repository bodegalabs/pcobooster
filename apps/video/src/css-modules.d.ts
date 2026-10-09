/** The marketing replica's CSS modules, as css-loader exports them (names kept as-is). */
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
