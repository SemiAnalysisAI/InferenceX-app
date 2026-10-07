export function actionClip(clips, action) {
  const names =
    action === 'fire' ? ['fire', 'shoot'] : action === 'lookat' ? ['lookat', 'inspect'] : [action];
  return clips.find((clip) => names.some((name) => clip.name.toLowerCase().includes(name)));
}
