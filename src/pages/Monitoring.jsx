import { useState } from 'react'

// Condition Monitoring module. The APM app (sensor health, RUL/trip lines,
// live feed, ML model lab) is a sibling deployment; we embed it here so the
// two read as one "Operations Excellence Platform". Same origin in production
// (both on shivnath250.github.io), so the frame loads cleanly.
const APM_URL = 'https://shivnath250.github.io/apm-platform/'

export default function Monitoring() {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="monitoring">
      <div className="monitoring-head">
        <div>
          <h1 style={{ fontSize: 20 }}>Condition Monitoring</h1>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            APM module — sensor health, trip-distance prognosis, ML model lab &amp; live feed. Embedded from the
            condition-monitoring deployment.
          </p>
        </div>
        <a className="btn" href={APM_URL} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
      </div>
      <div className="monitoring-frame-wrap">
        {!loaded && <div className="monitoring-loading"><span className="spinner" />Loading condition-monitoring module…</div>}
        <iframe
          className="monitoring-frame"
          src={APM_URL}
          title="APM Condition Monitoring"
          onLoad={() => setLoaded(true)}
          style={{ opacity: loaded ? 1 : 0 }}
        />
      </div>
    </div>
  )
}
