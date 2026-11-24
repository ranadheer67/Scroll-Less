import { useState } from 'react'
import { calculateReclaimedTime, formatDuration } from '../timeUtils.js'
import './AnalysisResults.css'

const APP_CATEGORY_RULES = [
  ['Social media', /^(instagram|tiktok|snapchat|facebook|reddit|pinterest|threads|x|twitter)$/i],
  ['Communication', /^(whatsapp|messages?|messenger|telegram|signal|discord|wechat)$/i],
  ['Video & streaming', /^(youtube|netflix|twitch|hulu|disney\+?|prime video|max|spotify)$/i],
  ['Games', /^(roblox|minecraft|fortnite|clash royale|clash of clans|pokemon go|among us)$/i],
  ['Work & learning', /^(gmail|outlook|google classroom|classroom|canvas|notion|docs|drive|teams|zoom)$/i],
  ['Web & utility', /^(safari|chrome|google chrome|settings|maps|phone|clock|calculator)$/i],
]

function getCategory(appName) {
  return APP_CATEGORY_RULES.find(([, pattern]) => pattern.test(appName.trim()))?.[0] || 'Unclassified'
}

function getVisibleDateKey(date) {
  if (!date?.trim()) return null
  const normalized = date.trim().replace(/\s+/g, ' ').toLowerCase()
  if (/\b(?:19|20|21)\d{2}\b/.test(normalized)) {
    const timestamp = Date.parse(date)
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString().slice(0, 10)
  }
  return normalized
}

function buildAnalysisModel(results) {
  const reports = results.map((record, index) => ({
    ...record,
    screenshotIndex: record.screenshotIndex ?? index + 1,
    dateLabel: record.date?.trim() || null,
    dateKey: getVisibleDateKey(record.date),
    apps: Array.isArray(record.apps) ? record.apps : [],
  }))
  const dateTotals = new Map()
  reports.forEach((report) => {
    if (report.dateKey && Number.isInteger(report.totalScreenTimeMinutes) && !dateTotals.has(report.dateKey)) {
      dateTotals.set(report.dateKey, {
        key: report.dateKey,
        date: report.dateLabel,
        minutes: report.totalScreenTimeMinutes,
        screenshotIndex: report.screenshotIndex,
      })
    }
  })
  const datedUsage = [...dateTotals.values()]
  const orderedDatedUsage = [...datedUsage].sort((a, b) => {
    const aDate = Date.parse(a.date)
    const bDate = Date.parse(b.date)
    if (Number.isFinite(aDate) && Number.isFinite(bDate)) return aDate - bDate
    return a.screenshotIndex - b.screenshotIndex
  })
  const weeklyUsage = orderedDatedUsage.slice(-7)
  const averageDailyMinutes = datedUsage.length
    ? Math.round(datedUsage.reduce((sum, day) => sum + day.minutes, 0) / datedUsage.length)
    : null

  const latestReport = [...reports].reverse().find((report) => Number.isInteger(report.totalScreenTimeMinutes))
    || reports[reports.length - 1]
    || null
  const latestAppReport = [...reports].reverse().find((report) => report.apps.some((app) => app.appName?.trim() && Number.isInteger(app.durationMinutes)))
    || latestReport

  const appPeriods = new Map()
  reports.forEach((report) => {
    report.apps.forEach((app) => {
      if (!app.appName?.trim() || !Number.isInteger(app.durationMinutes)) return
      const normalizedName = app.appName.trim().toLowerCase()
      const periodKey = report.dateKey || `screenshot-${report.screenshotIndex}`
      if (!appPeriods.has(normalizedName)) {
        appPeriods.set(normalizedName, { name: app.appName.trim(), category: getCategory(app.appName), periods: new Map() })
      }
      const appInfo = appPeriods.get(normalizedName)
      const current = appInfo.periods.get(periodKey)
      if (current == null || app.durationMinutes > current) appInfo.periods.set(periodKey, app.durationMinutes)
    })
  })

  const rankedApps = [...appPeriods.values()].map((app) => ({
    name: app.name,
    category: app.category,
    minutes: [...app.periods.values()].reduce((sum, minutes) => sum + minutes, 0),
  })).sort((a, b) => b.minutes - a.minutes)

  const categoryTotals = rankedApps.reduce((totals, app) => {
    totals[app.category] = (totals[app.category] || 0) + app.minutes
    return totals
  }, {})

  const dailyApps = (latestAppReport?.apps || [])
    .filter((app) => app.appName?.trim() && Number.isInteger(app.durationMinutes))
    .map((app) => ({ ...app, appName: app.appName.trim(), category: getCategory(app.appName) }))
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
  const uncertainApps = reports.flatMap((report) => report.apps
    .filter((app) => app.uncertain || !app.appName?.trim() || !Number.isInteger(app.durationMinutes) || app.confidence === 'low')
    .map((app, index) => ({
      key: `${report.screenshotIndex}-${index}`,
      screenshotIndex: report.screenshotIndex,
      dateLabel: report.dateLabel,
      appName: app.appName?.trim() || null,
      durationMinutes: Number.isInteger(app.durationMinutes) ? app.durationMinutes : null,
    })))

  return {
    reports,
    latestReport,
    latestAppReport,
    latestTotal: Number.isInteger(latestReport?.totalScreenTimeMinutes) ? latestReport.totalScreenTimeMinutes : null,
    weeklyUsage,
    weeklyMinutes: weeklyUsage.length ? weeklyUsage.reduce((sum, day) => sum + day.minutes, 0) : null,
    averageDailyMinutes,
    datedDayCount: datedUsage.length,
    rankedApps,
    rankedCategories: Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]),
    dailyApps,
    uncertainApps,
  }
}

function SummaryCards({ model }) {
  const latestDate = model.latestReport?.dateLabel || `Screenshot ${model.latestReport?.screenshotIndex ?? ''}`
  const weeklyCoverage = model.weeklyUsage.length === 7 ? '7 dated days available' : `${model.weeklyUsage.length} of up to 7 dated days · partial`
  const averageNote = model.datedDayCount ? `Across ${model.datedDayCount} unique dated day${model.datedDayCount === 1 ? '' : 's'}` : 'Requires a visible date'
  return <div className="real-summary-grid">
    <article className="real-summary-card"><span>DAILY SCREEN TIME</span><strong>{model.latestTotal == null ? 'Not visible' : formatDuration(model.latestTotal)}</strong><small>Latest visible total · {latestDate}</small></article>
    <article className="real-summary-card"><span>WEEKLY SCREEN TIME</span><strong>{model.weeklyMinutes == null ? 'Not visible' : formatDuration(model.weeklyMinutes)}</strong><small>{model.weeklyMinutes == null ? 'Requires dated screen-time totals' : weeklyCoverage}</small></article>
    <article className="real-summary-card"><span>AVERAGE DAILY SCREEN TIME</span><strong>{model.averageDailyMinutes == null ? 'Not visible' : formatDuration(model.averageDailyMinutes)}</strong><small>{averageNote}</small></article>
  </div>
}

function UsageRanking({ apps }) {
  const maxMinutes = Math.max(1, ...apps.map((app) => app.minutes))
  return <section className="real-analysis-module" aria-labelledby="real-app-ranking-title"><div className="real-module-heading"><div><span className="real-module-eyebrow">APP USAGE</span><h3 id="real-app-ranking-title">App-wise ranking</h3></div><span className="real-module-count">{apps.length} apps</span></div>
    {apps.length ? <><div className="real-app-ranking" role="img" aria-label="App-wise usage ranking from uploaded screenshot analysis">{apps.map((app, index) => <div className="real-app-row" key={app.name}><div className="real-app-meta"><span className="real-app-rank">{String(index + 1).padStart(2, '0')}</span><span className="real-app-name"><strong>{app.name}</strong><small>{app.category}</small></span><b>{formatDuration(app.minutes)}</b></div><div className="real-app-track"><span style={{ width: `${(app.minutes / maxMinutes) * 100}%` }}/></div></div>)}</div><p className="real-chart-note">Ranks combine visible durations by app across unique dated screenshots. Undated screenshots are kept separate.</p></> : <p className="real-empty-state">No readable app name and duration pairs were extracted.</p>}
  </section>
}

function CategoryDistribution({ categories }) {
  const total = categories.reduce((sum, [, minutes]) => sum + minutes, 0)
  return <section className="real-analysis-module" aria-labelledby="real-category-title"><div className="real-module-heading"><div><span className="real-module-eyebrow">USAGE MIX</span><h3 id="real-category-title">Category distribution</h3></div><span className="real-module-count">{categories.length} categories</span></div>
    {categories.length ? <><div className="real-category-list" role="img" aria-label="Usage distribution by app category">{categories.map(([category, minutes], index) => <div className="real-category-item" key={category}><div className="real-category-meta"><span>{category}</span><b>{formatDuration(minutes)}</b></div><div className="real-category-track"><span className={`real-category-fill real-category-fill-${index % 5}`} style={{ width: `${total ? (minutes / total) * 100 : 0}%` }}/></div><small>{total ? Math.round((minutes / total) * 100) : 0}% of visible app time</small></div>)}</div><p className="real-chart-note">Categories use simple app-name matching; unmatched apps are labeled Unclassified.</p></> : <p className="real-empty-state">Category distribution needs readable app names and durations.</p>}
  </section>
}

function DailyUsageChart({ apps, report }) {
  const maxMinutes = Math.max(1, ...apps.map((app) => app.durationMinutes))
  const period = report?.dateLabel || `Screenshot ${report?.screenshotIndex ?? ''}`
  return <section className="real-analysis-module" aria-labelledby="real-daily-chart-title"><div className="real-module-heading"><div><span className="real-module-eyebrow">DAILY CHART</span><h3 id="real-daily-chart-title">App time in the latest report</h3></div><span className="real-module-count">{period}</span></div>
    {apps.length ? <div className="real-daily-chart" role="img" aria-label={`Daily app usage in ${period}`}>{apps.map((app) => <div className="real-daily-bar-row" key={app.appName}><span>{app.appName}</span><div className="real-daily-bar-track"><i style={{ width: `${(app.durationMinutes / maxMinutes) * 100}%` }}/></div><b>{formatDuration(app.durationMinutes)}</b></div>)}</div> : <p className="real-empty-state">No readable daily app durations were extracted.</p>}
  </section>
}

function WeeklyUsageChart({ entries }) {
  const peak = Math.max(1, ...entries.map((entry) => entry.minutes))
  return <section className="real-analysis-module" aria-labelledby="real-week-chart-title"><div className="real-module-heading"><div><span className="real-module-eyebrow">WEEKLY CHART</span><h3 id="real-week-chart-title">Dated screen-time totals</h3></div><span className="real-module-count">{entries.length} dated days</span></div>
    {entries.length ? <div className="real-week-chart" role="img" aria-label="Screen-time totals grouped by visible screenshot date">{entries.map((entry) => <div className="real-week-column" key={entry.key}><span>{formatDuration(entry.minutes)}</span><div className="real-week-track"><i style={{ height: `${(entry.minutes / peak) * 100}%` }}/></div><small>{entry.date}</small></div>)}</div> : <p className="real-empty-state">No readable dates with screen-time totals were extracted. The weekly chart is unavailable for these screenshots.</p>}
  </section>
}

function UncertainRecords({ records }) {
  if (!records.length) return null
  return <section className="real-analysis-module" aria-labelledby="real-uncertain-title"><div className="real-module-heading"><div><span className="real-module-eyebrow">NEEDS REVIEW</span><h3 id="real-uncertain-title">Unclear screenshot values</h3></div><span className="real-module-count">{records.length} records</span></div><p className="real-chart-note">Gemini marked these records uncertain or could not read a name or duration. They are excluded from rankings and charts.</p><ul className="real-uncertain-list">{records.map((record) => <li key={record.key}><span>{record.appName || 'App name unavailable'}<small>{record.dateLabel || `Screenshot ${record.screenshotIndex}`}</small></span><b>{record.durationMinutes == null ? 'Duration unavailable' : formatDuration(record.durationMinutes)}</b></li>)}</ul></section>
}

function TimeReclamationSimulator({ apps }) {
  const [selectedName, setSelectedName] = useState('')
  const [targetValue, setTargetValue] = useState(null)
  const selectedApp = apps.find((app) => app.appName === selectedName) || apps[0]
  const currentMinutes = selectedApp?.durationMinutes || 0
  const targetMinutes = targetValue == null ? Math.floor((currentMinutes * 0.65) / 5) * 5 : Math.min(targetValue, currentMinutes)
  const saved = calculateReclaimedTime(currentMinutes, targetMinutes)

  if (!apps.length) return <section className="real-analysis-module real-simulator-module"><div className="real-module-heading"><div><span className="real-module-eyebrow">TIME RECLAMATION SIMULATOR</span><h3>Explore a possible target</h3></div></div><p className="real-empty-state">The simulator needs at least one app with a readable usage duration.</p></section>

  return <section className="real-analysis-module real-simulator-module" aria-labelledby="real-simulator-title"><div className="real-simulator-controls"><span className="real-module-eyebrow">TIME RECLAMATION SIMULATOR</span><h3 id="real-simulator-title">What could you make room for?</h3><p>Choose an app and adjust its daily target. The estimate uses the selected app’s visible duration as its daily baseline.</p><label htmlFor="real-analysis-app">App</label><select id="real-analysis-app" value={selectedApp?.appName} onChange={(event) => { setSelectedName(event.target.value); setTargetValue(null) }}>{apps.map((app) => <option key={app.appName} value={app.appName}>{app.appName} · {formatDuration(app.durationMinutes)}</option>)}</select><div className="real-target-heading"><label htmlFor="real-analysis-target">Daily target for {selectedApp?.appName}</label><strong>{formatDuration(targetMinutes)}</strong></div><input id="real-analysis-target" type="range" min="0" max={currentMinutes} step="1" value={targetMinutes} onChange={(event) => setTargetValue(Number(event.target.value))} aria-valuetext={`${formatDuration(targetMinutes)} daily`} /><div className="real-range-ends"><span>0m</span><span>Visible: {formatDuration(currentMinutes)}</span></div></div><div className="real-savings"><div className="real-savings-heading"><span>ESTIMATED TIME SAVED</span><small>BASED ON YOUR ANALYSIS</small></div><div className="real-savings-grid"><div><small>Per day</small><strong>{formatDuration(saved.perDay)}</strong></div><div><small>Per week</small><strong>{formatDuration(saved.perWeek)}</strong></div><div><small>Per month</small><strong>{formatDuration(saved.perMonth)}</strong></div><div><small>Per year</small><strong>{formatDuration(saved.perYear)}</strong></div></div><p>Projections assume the same saved time every day.</p></div></section>
}

export default function AnalysisResults({ results }) {
  const model = buildAnalysisModel(results)
  return <section id="analysis-results" className="analysis-results-section" aria-labelledby="analysis-results-title" aria-live="polite"><div className="analysis-results-inner"><div className="analysis-results-header"><div><span className="eyebrow">Gemini screenshot analysis</span><h2 id="analysis-results-title">Your usage, made visible.</h2><p>These results come from the screenshots you uploaded. Values the images did not show remain unavailable.</p></div><span className="analysis-source-badge">{model.reports.length} screenshot{model.reports.length === 1 ? '' : 's'} analyzed</span></div><SummaryCards model={model}/><div className="real-analysis-grid"><UsageRanking apps={model.rankedApps}/><CategoryDistribution categories={model.rankedCategories}/></div><div className="real-analysis-grid real-chart-grid"><DailyUsageChart apps={model.dailyApps} report={model.latestAppReport}/><WeeklyUsageChart entries={model.weeklyUsage}/></div><TimeReclamationSimulator apps={model.dailyApps}/><UncertainRecords records={model.uncertainApps}/><p className="analysis-source-note">Analysis is limited to values visible in the uploaded images. Weekly totals include only dates with readable screen-time values, and may be partial.</p></div></section>
}
