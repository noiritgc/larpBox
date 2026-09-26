const numberFormat = new Intl.NumberFormat('en-US');

export function formatClout(value: number): string {
  return numberFormat.format(value);
}

export function signedClout(value: number): string {
  return `${value >= 0 ? '+' : '−'}${numberFormat.format(Math.abs(value))}`;
}

export function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
