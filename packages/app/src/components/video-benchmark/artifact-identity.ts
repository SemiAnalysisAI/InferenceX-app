export function videoArtifactIdentity(name: string) {
  return (
    /^(?:h3-(?:results|video|fidelity)|video-serving)-(?<run>[1-9]\d*)-(?<attempt>[1-9]\d*)(?:-(?<configuration>[a-z0-9]+(?:-[a-z0-9]+)*))?$/u.exec(
      name,
    )?.groups ?? null
  );
}
