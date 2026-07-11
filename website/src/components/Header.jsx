import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Header.css'

const categories = [
  { name: "Men's/Unisex", path: '/collections/mens-unisex' },
  { name: "Women's", path: '/collections/womens' },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <div className="top-banner">
        <span>Enjoy <strong>£20 off</strong>. Use code <strong>"APPFIRSTORDER"</strong> on our mobile app.</span>
      </div>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo">
            <span className="logo-star">✴</span>
            <span className="logo-text">FLEEK</span>
          </Link>

          <nav className="nav">
            <div
              className="nav-item dropdown"
              onMouseEnter={() => setMenuOpen(true)}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button className="nav-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                Categories
              </button>
              {menuOpen && (
                <div className="dropdown-menu">
                  {categories.map((cat) => (
                    <Link
                      key={cat.path}
                      to={cat.path}
                      className="dropdown-item"
                      onClick={() => setMenuOpen(false)}
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <span className="nav-item">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 6.5L8 2L2.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M8 2V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Brands
            </span>
            <span className="nav-item">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              Suppliers
            </span>
          </nav>

          <div className="header-search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="#999" strokeWidth="1.5"/>
              <path d="M11 11L14 14" stroke="#999" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input type="text" placeholder="Search for |" />
          </div>

          <div className="header-actions">
            <span className="header-locale">EN</span>
            <span className="header-locale">GB £</span>
            <button className="btn-outline">Sign Up</button>
            <button className="btn-dark">Login</button>
          </div>
        </div>
      </header>
    </>
  )
}
