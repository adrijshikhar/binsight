// Type declarations for CSS Modules (*.module.css)
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}
