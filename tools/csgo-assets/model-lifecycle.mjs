// Cloned models share geometry and textures with the cache, but own materials/skeletons.
export function disposeModelInstance(root, { geometry = false } = {}) {
  const released = new Set();
  const release = (value) => {
    if (!value || released.has(value)) return;
    released.add(value);
    value.dispose?.();
  };
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      release(material);
    release(object.skeleton);
    if (geometry) release(object.geometry);
  });
}
