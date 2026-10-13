// Lets the demo import stylesheets dynamically; Vite bundles them.
declare module '*.css';

// A file's source text, which Vite inlines as a string: the custom toast shows its own files.
declare module '*?raw' {
  const source: string;
  export default source;
}
