export function RoomCodeChip({ code }: { code: string }) {
  return (
    <span className="chip chip-mono">
      <span className="sr-only">Room code {code.split('').join(' ')}</span>
      <span aria-hidden="true">{code}</span>
    </span>
  );
}
