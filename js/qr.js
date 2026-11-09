// QR code (bibliothèque qrcode-generator, MIT, chargée seulement quand on en a besoin).
let loading = null;

function load() {
  if (globalThis.qrcode) return Promise.resolve(globalThis.qrcode);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/qrcode/qrcode.js', import.meta.url).href;
    s.onload = () => resolve(globalThis.qrcode);
    s.onerror = () => {
      loading = null;
      reject(new Error('QR code indisponible'));
    };
    document.head.append(s);
  });
  return loading;
}

/** Image du QR code (noir sur blanc, pour rester lisible par l'appareil photo). */
export async function qrImage(text, alt) {
  const qrcode = await load();
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const img = document.createElement('img');
  img.src = qr.createDataURL(6, 4);
  img.alt = alt;
  img.className = 'qr';
  return img;
}
