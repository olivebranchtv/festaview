import { useEffect, useState } from 'react'
import { loadData } from './data.js'

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

function Poster({ film, color }) {
  return (
    <div className="card">
      <div className="poster" style={{ borderTopColor: color || 'var(--gold)' }}>
        {film.poster_url ? <img src={film.poster_url} alt="" /> : <span>{film.title}</span>}
      </div>
      <div className="card-title">{film.title}</div>
      <div className="card-meta">
        {[film.director, film.runtime_min ? film.runtime_min + ' min' : null, film.genre].filter(Boolean).join(' / ')}
      </div>
    </div>
  )
}

function Hub({ data }) {
  const liveFeeds = data.feeds.filter((f) => f.is_live || f.is_replay_loop)
  return (
    <>
      <section className="hero">
        <h1>Every festival. Every screen.</h1>
        <p>Film festivals from around the world, streaming all year on Roku and the web.</p>
      </section>

      {liveFeeds.length > 0 && (
        <section>
          <h2>Live Now</h2>
          <div className="row">
            {liveFeeds.map((f) => {
              const fest = data.festivals.find((x) => x.id === f.festival_id)
              return (
                <a key={f.id} className="live" href={fest ? '#/festival/' + fest.slug : '#/'}>
                  <span className={'dot' + (f.is_live ? ' on' : '')} />
                  {f.name}
                </a>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <h2>Festivals</h2>
        <div className="grid">
          {data.festivals.map((f) => (
            <a key={f.id} className="fest" href={'#/festival/' + f.slug} style={{ borderLeftColor: f.brand_color || 'var(--gold)' }}>
              <div className="fest-name">{f.name}</div>
              <div className="fest-tag">{f.tagline}</div>
              <div className="fest-count">{data.films.filter((m) => m.festival_id === f.id).length} films</div>
            </a>
          ))}
        </div>
      </section>

      {data.festivals.map((f) => {
        const films = data.films.filter((m) => m.festival_id === f.id)
        if (!films.length) return null
        return (
          <section key={f.id}>
            <h2><a href={'#/festival/' + f.slug}>{f.name}</a></h2>
            <div className="row">{films.map((m) => <Poster key={m.id} film={m} color={f.brand_color} />)}</div>
          </section>
        )
      })}
    </>
  )
}

function Festival({ data, slug }) {
  const fest = data.festivals.find((f) => f.slug === slug)
  if (!fest) return <p className="note">Festival not found. <a href="#/">Back to all festivals</a></p>
  const films = data.films.filter((m) => m.festival_id === fest.id)
  const feeds = data.feeds.filter((l) => l.festival_id === fest.id)
  return (
    <>
      <a className="back" href="#/">All festivals</a>
      <section className="hero" style={{ borderLeft: '6px solid ' + (fest.brand_color || 'var(--gold)'), paddingLeft: 20 }}>
        <h1>{fest.name}</h1>
        <p>{fest.tagline}</p>
      </section>
      {feeds.length > 0 && (
        <section>
          <h2>Live channel</h2>
          <div className="row">
            {feeds.map((l) => (
              <div key={l.id} className="live">
                <span className={'dot' + (l.is_live ? ' on' : '')} />
                {l.name}
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2>Official Selection</h2>
        <div className="row">
          {films.length ? films.map((m) => <Poster key={m.id} film={m} color={fest.brand_color} />) : <p className="note">No films published yet.</p>}
        </div>
      </section>
    </>
  )
}

export default function App() {
  const hash = useHashRoute()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData().then(setData).catch((e) => setError(e.message || 'Failed to load'))
  }, [])

  const m = hash.match(/^#\/festival\/(.+)$/)

  return (
    <div className="app">
      <header className="top">
        <a href="#/" className="brand">FESTAVIEW</a>
        <span className="tag">Every festival. Every screen.</span>
      </header>
      <main>
        {error && <p className="note">{error}</p>}
        {!data && !error && <p className="note">Loading...</p>}
        {data && data.demo && <p className="banner">Demo content. Connect Supabase (see web/.env.example) to show real festivals.</p>}
        {data && (m ? <Festival data={data} slug={m[1]} /> : <Hub data={data} />)}
      </main>
    </div>
  )
}
