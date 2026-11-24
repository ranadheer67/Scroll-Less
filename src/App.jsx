import { useEffect, useRef, useState } from 'react'
import { SAMPLE_APPS, SAMPLE_RECOMMENDATIONS, SAMPLE_WEEK } from './sampleData.js'
import { calculateReclaimedTime, formatDuration } from './timeUtils.js'
import AnalysisResults from './components/AnalysisResults.jsx'
import './App.css'

function Mark({ small = false }) {
  return <span className={`brand-mark${small ? ' brand-mark-small' : ''}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3.5v25M8.5 9.5 16 3.5l7.5 6M8.5 22.5 16 28.5l7.5-6" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.5 16h25" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round"/></svg></span>
}

function SectionHeading({ eyebrow, title, children }) {
  return <div className="section-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{children && <p>{children}</p>}</div>
}

function UploadIcon() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 26V8m0 0-7 7m7-7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 23v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
}

function AppIcon({ kind }) {
  const paths = {
    video: <><rect x="4" y="4" width="24" height="24" rx="8"/><path d="m14 11 7 5-7 5z"/></>,
    photo: <><rect x="4" y="4" width="24" height="24" rx="7"/><circle cx="12" cy="12" r="2"/><path d="m7 24 7-7 4 4 4-5 4 8"/></>,
    chat: <><path d="M27 15a10 10 0 0 1-10 10H8l-4 3V14A10 10 0 0 1 14 4h3a10 10 0 0 1 10 10z"/><path d="M10 14h.01M16 14h.01M22 14h.01" strokeWidth="3"/></>,
  }
  return <svg className="app-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}

function Header() {
  return <header className="site-header"><a className="brand" href="#top" aria-label="ScrollLess home"><Mark/><span>scroll<span className="brand-light">less</span></span></a><nav className="main-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#dashboard">Your time</a><a href="#recommendations">Alternatives</a></nav><a className="header-cta" href="#upload">Get started <span aria-hidden="true">↗</span></a></header>
}

function UploadPanel({ sampleMode, onUseSample, onExitSample, onAnalysisChange }) {
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const previewUrls = useRef(new Set())

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const addFiles = (fileList) => {
    const additions = []
    Array.from(fileList).forEach((file) => {
      const duplicate = files.some((item) => item.file.name === file.name && item.file.size === file.size)
        || additions.some((item) => item.file.name === file.name && item.file.size === file.size)
      if (duplicate) return
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      if (previewUrl) previewUrls.current.add(previewUrl)
      additions.push({ id: `${file.name}-${file.size}-${file.lastModified}`, file, previewUrl })
    })
    if (additions.length) {
      setFiles((current) => [...current, ...additions])
      onAnalysisChange(null)
      setError('')
    }
  }

  const removeFile = (id) => {
    const removed = files.find((item) => item.id === id)
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl)
      previewUrls.current.delete(removed.previewUrl)
    }
    setFiles((current) => current.filter((item) => item.id !== id))
    onAnalysisChange(null)
    setError('')
  }

  const analyze = async () => {
    setAnalyzing(true)
    setError('')
    onAnalysisChange(null)
    onExitSample()
    try {
      const body = new FormData()
      files.forEach(({ file }) => body.append('screenshots', file))
      const response = await fetch('/api/analyze', { method: 'POST', body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error?.message || `Screenshot analysis failed (HTTP ${response.status}).`)
      onAnalysisChange(Array.isArray(payload.results) ? payload.results : [])
    } catch (requestError) {
      setError(requestError.message || 'Could not reach the analysis server. Check that it is running and try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const selectSampleMode = () => onUseSample()

  return <section className="upload-section" id="upload">
    <div className="upload-copy">
      <span className="eyebrow">A clearer picture starts here</span>
      <h2>See where your<br/>little moments go.</h2>
      <p>Choose screenshots of your screen time or app usage. We’ll help you make sense of your habits, one small step at a time.</p>
      <div className="privacy-note"><span className="lock-icon" aria-hidden="true">⌑</span><span>Images are sent to Google Gemini for analysis and are not saved by ScrollLess.</span></div>
    </div>
    <div className={`upload-card${dragging ? ' is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}>
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} aria-label="Choose screen time screenshots"/>
      <div className="upload-card-top"><span className="upload-icon-wrap"><UploadIcon/></span><span className="upload-format">PNG · JPG · WEBP · UP TO 10</span></div>
      <h3>{files.length ? `${files.length} screenshot${files.length === 1 ? '' : 's'} selected` : 'Drop your screenshots here'}</h3>
      <p>Choose multiple images from your screen time or app usage settings.</p>
      <button type="button" className="button button-dark upload-button" disabled={analyzing} onClick={() => inputRef.current?.click()}>{files.length ? 'Add more screenshots' : 'Choose screenshots'} <span aria-hidden="true">↗</span></button>
      {files.length > 0 && <div className="screenshot-previews" aria-label="Selected screenshot previews">{files.map(({ id, file, previewUrl }) => <div className="screenshot-preview" key={id}>{previewUrl ? <img src={previewUrl} alt={`Preview of ${file.name}`}/> : <span className="preview-placeholder" aria-hidden="true">IMG</span>}<span className="preview-filename" title={file.name}>{file.name}</span><button type="button" onClick={() => removeFile(id)} aria-label={`Remove ${file.name}`}>×</button></div>)}</div>}
      {files.length > 0 && <button type="button" className="button analyze-button" disabled={analyzing} onClick={analyze}>{analyzing ? 'Analyzing screenshots…' : 'Analyze screenshots'} <span aria-hidden="true">→</span></button>}
      {error && <div className="upload-error" role="alert"><p>{error}</p><button type="button" className="sample-error-action" onClick={selectSampleMode}>Try Sample Analysis (Demo Data)</button></div>}
      <div className="sample-entry">
        <span className="sample-entry-label">No screenshots needed</span>
        <button type="button" className={`button sample-button${sampleMode ? ' sample-button-active' : ''}`} onClick={selectSampleMode}>{sampleMode ? 'Sample Analysis Active' : 'Try Sample Analysis'} <span aria-hidden="true">→</span></button>
        <span className="sample-entry-note">Uses clearly labeled demo data. It never replaces screenshot analysis.</span>
      </div>
      {sampleMode && <button type="button" className="exit-sample-button" onClick={onExitSample}>Exit Sample Analysis</button>}
      <span className="upload-hint">Images stay in memory only during analysis. Maximum 8 MB each.</span>
    </div>
  </section>
}

function HowItWorks() {
  const steps = [
    { number: '01', title: 'Bring your screen time', text: 'Pick screenshots from your phone’s built-in screen time or digital wellbeing settings.', icon: '▧' },
    { number: '02', title: 'Spot the patterns', text: 'See how your daily app time adds up and where your attention tends to go.', icon: '◷' },
    { number: '03', title: 'Make room for more', text: 'Find thoughtful alternatives that fit your interests and the life you want offline.', icon: '↗' },
  ]
  return <section className="how-section section-wrap" id="how-it-works"><SectionHeading eyebrow="A little more intentional" title="Small steps. More space.">No judgment, no all-or-nothing rules. Just a clearer view of your time and a place to start.</SectionHeading><div className="steps-grid">{steps.map((step) => <article className="step-card" key={step.number}><div className="step-top"><span className="step-number">{step.number}</span><span className="step-icon" aria-hidden="true">{step.icon}</span></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
}

function DashboardPreview({ sampleMode }) {
  if (sampleMode) return <SampleDashboard/>
  const apps = [{ name: 'Short videos', time: '1h 42m', percent: 78, icon: 'video', color: 'coral' }, { name: 'Social', time: '58m', percent: 48, icon: 'photo', color: 'lavender' }, { name: 'Messaging', time: '36m', percent: 31, icon: 'chat', color: 'sage' }]
  const bars = [38, 53, 43, 66, 49, 79, 61, 45, 73, 56, 88, 62, 51, 76, 58, 91, 65, 48, 72, 54, 84, 63, 47, 69, 57, 80, 60, 45]
  return <section className="dashboard-section" id="dashboard"><div className="dashboard-inner section-wrap"><div className="dashboard-copy"><span className="eyebrow">Your time, made visible</span><h2>A better sense<br/>of the bigger picture.</h2><p>Not just minutes and minutes. A calm, useful look at how your apps fit into your day—with the context to decide what feels right for you.</p><a className="text-link" href="#upload">Start with a screenshot <span aria-hidden="true">→</span></a></div><div className="dashboard-card"><div className="dash-top"><div><span className="dash-label">WEEKLY OVERVIEW</span><h3>Your screen time</h3></div><span className="dash-period">This week⌄</span></div><div className="dash-summary"><div><span className="dash-big">24<span>h</span> 18<span>m</span></span><span className="dash-sub">Daily average <b>3h 28m</b></span></div><div className="dash-change"><span>↘ 12%</span><small>vs. last week</small></div></div><div className="chart" aria-label="Illustrative weekly screen time chart">{bars.map((height, index) => <span className={`chart-bar${index === 15 ? ' chart-bar-highlight' : ''}`} style={{ height: `${height}%` }} key={index}/>)}</div><div className="chart-days"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div><div className="dash-apps-head"><span>TOP CATEGORIES</span><span>TIME</span></div><div className="dash-apps">{apps.map((app) => <div className="app-row" key={app.name}><span className={`app-icon-wrap ${app.color}`}><AppIcon kind={app.icon}/></span><span className="app-name">{app.name}<span className="app-progress"><i style={{ width: `${app.percent}%` }}/></span></span><span className="app-time">{app.time}</span></div>)}</div><p className="preview-caption">Illustrative preview · your dashboard isn’t connected yet</p></div></div></section>
}

export function SampleDashboard() {
  const [selectedAppId, setSelectedAppId] = useState(SAMPLE_APPS[0].id)
  const initialApp = SAMPLE_APPS[0]
  const [dailyTarget, setDailyTarget] = useState(Math.floor((initialApp.minutes * 0.65) / 5) * 5)
  const selectedApp = SAMPLE_APPS.find((app) => app.id === selectedAppId) || initialApp
  const totalToday = SAMPLE_APPS.reduce((total, app) => total + app.minutes, 0)
  const totalWeek = SAMPLE_WEEK.reduce((total, day) => total + day.minutes, 0)
  const dailyAverage = Math.round(totalWeek / SAMPLE_WEEK.length)
  const timeSaved = calculateReclaimedTime(selectedApp.minutes, dailyTarget)
  const rankedApps = [...SAMPLE_APPS].sort((a, b) => b.minutes - a.minutes)
  const maxAppMinutes = Math.max(...SAMPLE_APPS.map((app) => app.minutes))
  const weeklyPeak = Math.max(...SAMPLE_WEEK.map((day) => day.minutes))
  const categories = SAMPLE_APPS.reduce((totals, app) => {
    totals[app.category] = (totals[app.category] || 0) + app.minutes
    return totals
  }, {})
  const rankedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1])

  const chooseApp = (event) => {
    const nextApp = SAMPLE_APPS.find((app) => app.id === event.target.value)
    if (!nextApp) return
    setSelectedAppId(nextApp.id)
    setDailyTarget(Math.floor((nextApp.minutes * 0.65) / 5) * 5)
  }

  return <section className="dashboard-section sample-dashboard-section" id="dashboard"><div className="sample-dashboard section-wrap">
    <div className="sample-dashboard-heading"><div><span className="eyebrow">Sample Analysis</span><h2>Your screen time, in context.</h2><p>A realistic example dashboard to explore the app.</p></div><div className="demo-data-badge"><span className="demo-dot"/> DEMO DATA · NOT FROM YOUR SCREENSHOTS</div></div>
    <div className="sample-metric-grid">
      <article className="sample-metric"><span>DAILY SCREEN TIME</span><strong>{formatDuration(totalToday)}</strong><small>Sample day · 6 apps</small></article>
      <article className="sample-metric"><span>WEEKLY SCREEN TIME</span><strong>{formatDuration(totalWeek)}</strong><small>Nov 16–22 · 7 days</small></article>
      <article className="sample-metric"><span>DAILY AVERAGE</span><strong>{formatDuration(dailyAverage)}</strong><small>Across the sample week</small></article>
    </div>
    <div className="sample-dashboard-grid">
      <article className="sample-panel sample-app-panel"><div className="sample-panel-heading"><div><span className="dash-label">APP-WISE USAGE</span><h3>Daily app ranking</h3></div><span className="demo-mini-label">DEMO</span></div><p className="sample-panel-note">Ranked by daily sample minutes. The marker follows your selected target.</p>
        <div className="sample-usage-chart" role="img" aria-label="Demo data app usage chart. Bars show daily app minutes and the marker shows the selected target.">
          {rankedApps.map((app, index) => <div className="sample-usage-row" key={app.id}><div className="sample-usage-meta"><span className="sample-rank">{String(index + 1).padStart(2, '0')}</span><span className={`sample-app-symbol ${app.color}`}><AppIcon kind={app.kind}/></span><span className="sample-app-label"><strong>{app.name}</strong><small>{app.category}</small></span><b>{formatDuration(app.minutes)}</b></div><div className="sample-usage-track"><span className={`sample-usage-fill${app.id === selectedAppId ? ' target-app-fill' : ''}`} style={{ width: `${(app.minutes / maxAppMinutes) * 100}%` }}/>{app.id === selectedAppId && <span className="sample-target-marker" style={{ left: `${(dailyTarget / maxAppMinutes) * 100}%` }} title={`Target: ${formatDuration(dailyTarget)}`}/>}</div></div>)}
        </div><div className="sample-chart-legend"><span><i className="legend-actual"/> Daily usage</span><span><i className="legend-target"/> Daily target</span></div>
      </article>
      <article className="sample-panel sample-category-panel"><div className="sample-panel-heading"><div><span className="dash-label">SCREEN-TIME DISTRIBUTION</span><h3>Where the day goes</h3></div><span className="demo-mini-label">DEMO</span></div><p className="sample-panel-note">Daily minutes grouped by app category.</p>
        <div className="sample-category-chart" role="img" aria-label="Demo data screen-time distribution by category.">{rankedCategories.map(([category, minutes], index) => <div className="sample-category-row" key={category}><div className="sample-category-meta"><span>{category}</span><b>{formatDuration(minutes)}</b></div><div className="sample-category-track"><span className={`category-fill category-fill-${index % 4}`} style={{ width: `${(minutes / totalToday) * 100}%` }}/></div><small>{Math.round((minutes / totalToday) * 100)}% of daily use</small></div>)}</div>
      </article>
    </div>
    <article className="sample-panel sample-week-panel"><div className="sample-panel-heading"><div><span className="dash-label">DAILY + WEEKLY SUMMARY</span><h3>This sample week</h3></div><span className="sample-week-total">{formatDuration(totalWeek)} total</span></div><div className="sample-week-chart" role="img" aria-label="Demo data screen time by day for one sample week.">{SAMPLE_WEEK.map((day) => <div className="sample-week-column" key={day.day}><span className="sample-week-value">{formatDuration(day.minutes)}</span><div className="sample-week-track"><span style={{ height: `${(day.minutes / weeklyPeak) * 100}%` }}/></div><span className="sample-week-day">{day.day}</span></div>)}</div></article>
    <article className="sample-panel sample-simulator"><div className="simulator-copy"><span className="eyebrow">Time reclamation simulator</span><h3>What could you make room for?</h3><p>Choose an app and set a daily target. These estimates compare the target with this demo app’s sample usage.</p><label className="simulator-select-label" htmlFor="sample-app-select">Choose an app</label><select id="sample-app-select" value={selectedAppId} onChange={chooseApp}>{rankedApps.map((app) => <option value={app.id} key={app.id}>{app.name} · {formatDuration(app.minutes)} daily</option>)}</select><div className="simulator-range-heading"><label htmlFor="sample-target-slider">Daily target for {selectedApp.name}</label><strong>{formatDuration(dailyTarget)}</strong></div><input id="sample-target-slider" className="simulator-range" type="range" min="0" max={selectedApp.minutes} step="1" value={dailyTarget} onChange={(event) => setDailyTarget(Number(event.target.value))} aria-valuetext={`${formatDuration(dailyTarget)} per day`}/><div className="range-endpoints"><span>0m</span><span>Current sample: {formatDuration(selectedApp.minutes)}</span></div><p className="simulator-footnote">A target is an option, not a rule. Sample calculations assume the same saved time each day.</p></div><div className="simulator-results"><div className="simulator-results-head"><span>ESTIMATED TIME SAVED</span><span className="demo-mini-label">DEMO CALCULATION</span></div><div className="simulator-result-grid"><div><small>Per day</small><strong>{formatDuration(timeSaved.perDay)}</strong></div><div><small>Per week</small><strong>{formatDuration(timeSaved.perWeek)}</strong></div><div><small>Per month</small><strong>{formatDuration(timeSaved.perMonth)}</strong></div><div><small>Per year</small><strong>{formatDuration(timeSaved.perYear)}</strong></div></div><p>Compared with {formatDuration(selectedApp.minutes)} of current sample use per day.</p></div></article>
    <p className="sample-disclaimer">All values on this dashboard are predefined demo data. They were not extracted from uploaded screenshots or your device.</p>
  </div></section>
}

export function Recommendations({ sampleMode }) {
  const topApps = [...SAMPLE_APPS].sort((a, b) => b.minutes - a.minutes).slice(0, 3)
  return <section className="recommend-section section-wrap" id="recommendations"><div className="recommend-art" aria-hidden="true"><div className="sun-shape"/><div className="book-shape"><span/><span/><span/></div><div className="plant-shape"><i/><i/><i/><b/></div><div className="art-label">A little time, returned.</div></div><div className="recommend-copy"><span className="eyebrow">Beyond the scroll</span><h2>Make space for<br/>what feels like you.</h2><p>Less scrolling isn’t the whole story. Discover offline ideas shaped around your interests, your energy, and the time you’d like back.</p>{sampleMode ? <><div className="demo-recommendation-label">DEMO RECOMMENDATIONS · BASED ON SAMPLE USAGE</div><div className="demo-recommendations">{topApps.map((app) => <article className="demo-recommendation" key={app.id}><span>{app.name} · {formatDuration(app.minutes)} in sample data</span><p>{SAMPLE_RECOMMENDATIONS[app.id]}</p></article>)}</div></> : <><div className="interest-tags"><span>✳ Outside time</span><span>↗ Make something</span><span>♡ Slow down</span></div><p className="coming-soon">Personalised suggestions are coming soon.</p></>}</div></section>
}

function Footer() {
  return <footer className="site-footer"><div className="footer-main"><a className="brand footer-brand" href="#top"><Mark small/><span>scroll<span className="brand-light">less</span></span></a><p>A little less scroll.<br/>A little more life.</p><a className="footer-back" href="#top">Back to top ↑</a></div><div className="footer-bottom"><span>© 2026 ScrollLess</span><span>Made for a more mindful everyday.</span><a href="#upload">Get started ↗</a></div></footer>
}

function App() {
  const [sampleMode, setSampleMode] = useState(false)
  const [analysisResults, setAnalysisResults] = useState(null)
  useEffect(() => {
    if (sampleMode) document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sampleMode])
  useEffect(() => {
    if (analysisResults?.length) document.getElementById('analysis-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [analysisResults])
  return <div id="top"><Header/><main><section className="hero-section"><div className="hero-copy"><span className="hero-kicker"><span className="kicker-dot"/> A kinder relationship with your screen</span><h1>Be where<br/>your <em>life</em> is.</h1><p>Understand the time you spend scrolling, then find a little more room for the things that make you feel like you.</p><a className="button button-dark hero-button" href="#upload">Get a clearer picture <span aria-hidden="true">↗</span></a><div className="hero-footnote"><span className="tiny-spark">✳</span> Curious, not judgmental. Always.</div></div><div className="hero-visual"><div className="hero-paper"><span className="paper-label">A NOTE TO SELF</span><span className="paper-rule"/><span className="paper-line paper-line-short"/><div className="paper-sun"/><span className="paper-rule paper-rule-bottom"/></div><div className="hero-time-card"><span className="time-icon" aria-hidden="true">◷</span><span className="time-card-label">TIME WELL SPENT</span><strong>A little more<br/>of what matters.</strong><span className="time-card-under">YOU’RE ALLOWED TO BEGIN AGAIN</span></div><span className="hero-orbit orbit-one"/><span className="hero-orbit orbit-two"/><span className="hero-sticker">LESS<br/>SCROLL<br/>MORE SOUL</span><span className="hero-caption">Your time is yours.</span></div></section><div className="trust-strip"><span>DESIGNED FOR REAL LIFE</span><i/><span>GENTLE BY DESIGN</span><i/><span>YOUR TIME, YOUR CHOICE</span></div><UploadPanel sampleMode={sampleMode} onUseSample={() => setSampleMode(true)} onExitSample={() => setSampleMode(false)} onAnalysisChange={setAnalysisResults}/>{analysisResults && <AnalysisResults results={analysisResults}/>}<HowItWorks/><DashboardPreview sampleMode={sampleMode}/><Recommendations sampleMode={sampleMode}/></main><Footer/></div>
}

export default App
