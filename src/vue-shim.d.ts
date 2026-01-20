/**
 * Vue Single File Component type declarations.
 * This tells TypeScript how to handle .vue file imports.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
