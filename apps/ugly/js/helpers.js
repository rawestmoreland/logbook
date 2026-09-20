export function makeCell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}
