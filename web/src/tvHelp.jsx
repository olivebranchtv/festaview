import { useState } from 'react'
import { useSeo } from './seo.js'
import { TVS, DEVICES, TV_NOTES, GENERAL_TIPS, MIRROR_TROUBLE, optionsFor, detectDevice } from './tvHelpContent.js'

// Pick your TV and your device, get the steps. Used on the help page and inside the theater room.
export function TvGuide({ compact }) {
  const [tv, setTv] = useState('')
  const [device, setDevice] = useState(detectDevice)
  const options = tv ? optionsFor(tv, device) : []
  return (
    <div className={'tvhelp' + (compact ? ' compact' : '')}>
      <h2 className="h3">1. Which TV do you have?</h2>
      <div className="chips" role="group" aria-label="Your TV">
        {TVS.map((t) => (
          <button key={t.id} type="button" className={'chip' + (tv === t.id ? ' on' : '')} aria-pressed={tv === t.id} onClick={() => setTv(t.id)}>
            <strong>{t.name}</strong><small>{t.sub}</small>
          </button>
        ))}
      </div>
      <h2 className="h3">2. What are you watching on?</h2>
      <div className="chips" role="group" aria-label="Your device">
        {DEVICES.map((d) => (
          <button key={d.id} type="button" className={'chip' + (device === d.id ? ' on' : '')} aria-pressed={device === d.id} onClick={() => setDevice(d.id)}>
            <strong>{d.name}</strong>
          </button>
        ))}
      </div>
      {!tv && <p className="note">Choose your TV above to see the steps.</p>}
      {tv && (
        <div className="tvhelp-steps">
          <p className="tvhelp-note">{TV_NOTES[tv]}</p>
          {options.map((o) => (
            <section key={o.name} className="tvhelp-opt">
              <h3>{o.name}</h3>
              <ol>{o.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {o.name === 'Screen mirroring' && (
                <details className="tvhelp-trouble">
                  <summary>Stuck on Connecting? Try these</summary>
                  <ul>{MIRROR_TROUBLE.map((t) => <li key={t}>{t}</li>)}</ul>
                </details>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export function WatchOnTvPage() {
  useSeo({ title: 'How to Watch on Your TV: Roku, Samsung, LG and More', description: 'Step by step help to watch Festaview Cinemas on your TV. Cast or mirror from your phone or computer to Roku, Samsung, LG, Fire TV, Chromecast and Apple TV.' })
  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Watch on your TV</span></nav>
      <h1>How to watch on your TV</h1>
      <p className="lede">Festaview Cinemas plays in your web browser. You can put it on the big screen in a few taps. Pick your TV and your device and follow the steps.</p>
      <TvGuide />
      <h2>Tips for a smooth show</h2>
      <ul className="ticks">{GENERAL_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="note">Menu names change a little between TV models and software versions. If a step does not match your TV, search your TV's manual for "screen mirroring" or "AirPlay". Need help? See the <a href="/cinema">showtimes</a> or <a href="/about">about Festaview</a>.</p>
    </section>
  )
}
