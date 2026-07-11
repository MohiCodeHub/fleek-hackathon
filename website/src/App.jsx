import { Routes, Route, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Header from './components/Header'
import CollectionPage from './components/CollectionPage'
import './App.css'

function HomePage() {
  const [stats, setStats] = useState({ mens: 0, womens: 0 })

  useEffect(() => {
    Promise.all([
      fetch('/api/products/mens-unisex?limit=0').then(r => r.json()),
      fetch('/api/products/womens?limit=0').then(r => r.json()),
    ]).then(([mens, womens]) => {
      setStats({ mens: mens.total, womens: womens.total })
    })
  }, [])

  return (
    <div className="home">
      <h1>Welcome to Fleek</h1>
      <p className="home-subtitle">B2B Wholesale Vintage Clothing Marketplace</p>
      <div className="home-categories">
        <Link to="/collections/mens-unisex" className="category-card">
          <div className="category-icon">👔</div>
          <h2>Men's/Unisex</h2>
          <p>{stats.mens} products</p>
        </Link>
        <Link to="/collections/womens" className="category-card">
          <div className="category-icon">👗</div>
          <h2>Women's</h2>
          <p>{stats.womens} products</p>
        </Link>
      </div>
    </div>
  )
}

function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/collections/mens-unisex"
          element={<CollectionPage title="Vintage Menswear" collection="mens-unisex" />}
        />
        <Route
          path="/collections/womens"
          element={<CollectionPage title="Vintage Womenswear" collection="womens" />}
        />
      </Routes>
    </>
  )
}

export default App
