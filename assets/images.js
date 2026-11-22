// Dewgal · préparation des photos dans le navigateur (compression + version floutée)
function lireImage(file) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => ko(new Error("Cette image n'a pas pu être lue. Essayez une photo JPEG ou PNG."));
    img.src = url;
  });
}
function versCanvas(img, maxCote) {
  const r = Math.min(1, maxCote / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * r));
  c.height = Math.max(1, Math.round(img.naturalHeight * r));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// Photo nette compressée (≈ 1200 px)
async function photoCompressee(file) {
  const img = await lireImage(file);
  const c = versCanvas(img, 1200);
  const out = c.toDataURL('image/jpeg', 0.82);
  c.width = c.height = 0; // libère la mémoire (iPhone)
  return out;
}
// Version floutée irréversible : réduite à ~16 px puis agrandie et adoucie
async function photoFloutee(file) {
  const img = await lireImage(file);
  const mini = versCanvas(img, 16);
  const c = document.createElement('canvas');
  c.width = 480; c.height = Math.round(480 * mini.height / mini.width);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  try { ctx.filter = 'blur(18px)'; } catch (e) {}
  ctx.drawImage(mini, -20, -20, c.width + 40, c.height + 40);
  return c.toDataURL('image/jpeg', 0.7);
}
