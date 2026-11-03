/** Clickable column header: first click sorts ascending, second click descending. */
export default function SortHeader({ field, label, sort, onSort, className }) {
  const active = sort.sortBy === field;
  const arrow = active ? (sort.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const nextDir = active && sort.sortDir === 'asc' ? 'desc' : 'asc';

  return (
    <th className={className} aria-sort={active ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-button" onClick={() => onSort({ sortBy: field, sortDir: nextDir })}>
        {label}
        {arrow}
      </button>
    </th>
  );
}
