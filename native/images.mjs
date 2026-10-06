export const IMAGE_LIMIT = 4 * 1024 * 1024;
export const REQUEST_LIMIT = 8 * 1024 * 1024;

export function decodeImage(image) {
  if (image === undefined) return undefined;
  if (typeof image !== 'string' || image.length > Math.ceil(IMAGE_LIMIT / 3) * 4 + 64) throw new Error('Image is too large. Use an image under 4 MB.');
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) throw new Error('Attach a PNG, JPEG, WebP or GIF image. Remote image links must be downloaded first.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > IMAGE_LIMIT || bytes.toString('base64') !== match[2]) throw new Error('The image attachment is invalid or too large.');
  const mime = match[1];
  const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    : ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
  if (!valid) throw new Error('Image content does not match its file type. Try uploading the image again.');
  return { mime, bytes, base64: match[2], extension: mime.split('/')[1] };
}

export function claudeImageMessage(prompt, image) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
    { type: 'text', text: prompt },
  ] }, parent_tool_use_id: null }) + '\n';
}
