import { getFontEmbedCSS, toBlob } from 'html-to-image';

/**
 * html-to-image caches the stylesheets it fetches, and on the second capture it
 * hands back an incomplete set of @font-face rules: the Barlow Condensed faces
 * drop out and the overlay re-wraps in a fallback face. Resolving the embed CSS
 * once and passing it to every capture keeps exports two and beyond identical
 * to the first.
 */
let fontCSS: Promise<string> | undefined;
const embedCSS = (node: HTMLElement) => (fontCSS ??= getFontEmbedCSS(node));

export async function exportPhoto(ref: any, share: boolean) {
  await document.fonts.ready;
  const node = ref.current as HTMLElement;
  const blob = await toBlob(node, {
    pixelRatio: 1080 / node.clientWidth,
    cacheBust: false,
    fontEmbedCSS: await embedCSS(node),
  });
  if (!blob) throw new Error('Could not create your photo. Please try again.');
  const file = new File([blob], 'my-crwplus.png', { type: 'image/png' });
  if (share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'My CRW+' });
  } else {
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'my-crwplus.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
