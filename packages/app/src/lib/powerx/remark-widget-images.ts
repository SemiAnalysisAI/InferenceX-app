import type { Parent, Root } from 'mdast';

import { tutorialWidgetName } from './tutorial';

/**
 * Lifts a paragraph whose only child is a widget image (`../../public/images/powerx-tutorial/
 * widgets/<name>.png`) to the image itself, so the page's `img` override can render the widget as
 * a block without nesting it inside `<p>`. GitHub still shows the paragraph with the PNG.
 */

function hasChildren(node: unknown): node is Parent {
  return typeof node === 'object' && node !== null && Array.isArray((node as Parent).children);
}

function walk(node: Parent): void {
  node.children = node.children.map((child) => {
    if (child.type === 'paragraph' && child.children.length === 1) {
      const [only] = child.children;
      if (only.type === 'image' && tutorialWidgetName(only.url) !== null) return only;
    }
    if (hasChildren(child)) walk(child);
    return child;
  });
}

export function remarkWidgetImages() {
  return (tree: Root) => {
    walk(tree);
  };
}
