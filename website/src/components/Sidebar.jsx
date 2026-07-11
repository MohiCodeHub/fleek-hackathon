import './Sidebar.css'

const filters = [
  { label: 'Quality Score', open: false },
  { label: 'Department', open: false },
  { label: 'Bundle Type', open: false },
  { label: 'Categories', open: false },
  { label: 'Brands', open: false },
  { label: 'Size', open: false },
  { label: 'Grade', open: false },
]

export default function Sidebar({ sortBy, onSortChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Sort by</span>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </div>
        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value="default">Default</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="name">Name A-Z</option>
        </select>
      </div>

      <div className="sidebar-section">
        <label className="toggle-row">
          <span>On sale</span>
          <div className="toggle">
            <div className="toggle-knob" />
          </div>
        </label>
      </div>

      {filters.map((filter) => (
        <div key={filter.label} className="sidebar-section">
          <div className="sidebar-header">
            <span>{filter.label}</span>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      ))}
    </aside>
  )
}
