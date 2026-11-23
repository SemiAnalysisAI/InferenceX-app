import 'react';

declare module 'react' {
  interface SVGAttributes<T> {
    /** The global `translate` attribute, which React's SVG types omit. Charts set `no` so page translators leave d3 text alone. */
    translate?: 'yes' | 'no' | undefined;
  }
}
