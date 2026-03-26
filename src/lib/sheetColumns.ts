/** Índice 0-based de columna → letra tipo Excel (A, B, …, Z, AA, AB, …, AL). */
export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}
