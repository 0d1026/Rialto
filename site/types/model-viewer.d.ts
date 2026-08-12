import type { DetailedHTMLProps, HTMLAttributes } from 'react';

// `@google/model-viewer` registers a custom element but only ships a
// HTMLElementTagNameMap augmentation, not a JSX one. React 19's types resolve
// the JSX namespace from the "react" module (not the old ambient global
// `JSX`), so the augmentation has to target `declare module "react"` here.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        exposure?: string;
        'shadow-intensity'?: string;
        'environment-image'?: string;
        'camera-orbit'?: string;
        'field-of-view'?: string;
        'disable-zoom'?: boolean;
        'interaction-prompt'?: string;
        loading?: 'auto' | 'lazy' | 'eager';
        reveal?: 'auto' | 'interaction' | 'manual';
      };
    }
  }
}
