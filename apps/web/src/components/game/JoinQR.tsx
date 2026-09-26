import { QRCodeSVG } from 'qrcode.react';

/** Real SVG QR code for the actual join URL, with a white quiet zone. */
export function JoinQR({ url, size = 240 }: { url: string; size?: number }) {
  return (
    <div className="host-qr inline-block rounded-[16px] border-2 border-ink bg-white p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
      <QRCodeSVG value={url} size={size} level="M" marginSize={4} bgColor="#FFFFFF" fgColor="#171717" title={`QR code for ${url}`} />
    </div>
  );
}
