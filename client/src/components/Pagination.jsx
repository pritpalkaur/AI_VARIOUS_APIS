const PAGE_SIZES = [10, 20, 50, 100];

export default function Pagination({ pagination, onPageChange, onPageSizeChange }) {
  if (!pagination) return null;
  const { page, pageSize, totalItems, totalPages } = pagination;

  return (
    <div className="pagination">
      <span className="muted">
        {totalItems} item{totalItems === 1 ? '' : 's'}
      </span>
      <span className="spacer" />
      <label className="inline">
        Per page
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        ‹ Prev
      </button>
      <span>
        Page {totalPages === 0 ? 0 : page} of {totalPages}
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next ›
      </button>
    </div>
  );
}
