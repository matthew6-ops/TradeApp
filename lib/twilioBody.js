export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export function parseUrlEncoded(bodyText) {
  const params = new URLSearchParams(bodyText);
  const out = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

