export function RoomCodeChip({ code }: { code: string }) {
  return (
    <span className="chip chip-mono" aria-label={`Room code ${code.split('').join(' ')}`}>
      {code}
    </span>
  );
}
