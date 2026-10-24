const QR_FRAME_PREFIX = "STORMSALE-XDR";
const QR_FRAME_CHUNK_SIZE = 700;

export interface OfflineXdrQrFrame {
  index: number;
  total: number;
  payload: string;
}

export function splitTransactionXdrIntoQrFrames(xdr: string): OfflineXdrQrFrame[] {
  const normalizedXdr = xdr.trim();
  if (!normalizedXdr) throw new Error("Transaction XDR is required to generate QR frames.");

  const total = Math.ceil(normalizedXdr.length / QR_FRAME_CHUNK_SIZE);
  return Array.from({ length: total }, (_, frameIndex) => {
    const index = frameIndex + 1;
    const chunkStart = frameIndex * QR_FRAME_CHUNK_SIZE;
    const chunk = normalizedXdr.slice(chunkStart, chunkStart + QR_FRAME_CHUNK_SIZE);
    return {
      index,
      total,
      payload: `${QR_FRAME_PREFIX}|${index}/${total}|${chunk}`,
    };
  });
}

export function assembleTransactionXdrFromQrFrames(frames: string[]): string {
  if (frames.length === 0) throw new Error("No QR frame data was provided.");
  const parsedFrames = frames.map((frame) => {
    const match = frame.trim().match(/^STORMSALE-XDR\|(\d+)\/(\d+)\|([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("A QR frame is malformed.");
    return {
      index: Number(match[1]),
      total: Number(match[2]),
      chunk: match[3],
    };
  });

  const expectedTotal = parsedFrames[0].total;
  if (
    parsedFrames.some(
      (frame) => frame.total !== expectedTotal || frame.total !== parsedFrames.length,
    )
  ) {
    throw new Error("QR frames are incomplete or belong to different transactions.");
  }
  parsedFrames.sort((a, b) => a.index - b.index);
  if (parsedFrames.some((frame, index) => frame.index !== index + 1)) {
    throw new Error("QR frames contain duplicate or missing sequence numbers.");
  }
  return parsedFrames.map((frame) => frame.chunk).join("");
}
