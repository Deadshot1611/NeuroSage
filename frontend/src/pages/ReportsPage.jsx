import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchReports } from '../api/reportApi'
import { useAuth } from '../context/AuthContext'

const MODULE_META = {
  asd:        { label: 'ASD Screening',     accent: '#00c9a7', icon: '👁️' },
  dysgraphia: { label: 'Dysgraphia',        accent: '#6366f1', icon: '✏️' },
  speech:     { label: 'Developmental Stuttering', accent: '#f59e0b', icon: '🎙️' },
}

function fmt(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
         ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function ReportSummary({ result, module }) {
  if (module === 'asd') {
    const pred = result?.prediction
    if (!pred) return null
    const isASD = pred.prediction === 'ASD'
    return (
      <div className="flex flex-wrap gap-3 mt-3">
        <Chip label={isASD ? 'ASD Indicated' : 'Typical'} color={isASD ? '#dc2626' : '#16a34a'} />
        {pred.confidence != null && <Chip label={`Confidence ${(pred.confidence * 100).toFixed(0)}%`} color="#6b7280" />}
        {pred.aq10_score != null && <Chip label={`AQ-10: ${pred.aq10_score}`} color="#6b7280" />}
      </div>
    )
  }
  if (module === 'dysgraphia') {
    const score = result?.finalScore
    if (score == null) return null
    const risk = score > 70 ? 'High Risk' : score > 40 ? 'Medium Risk' : 'Low Risk'
    const color = score > 70 ? '#dc2626' : score > 40 ? '#d97706' : '#16a34a'
    return (
      <div className="flex flex-wrap gap-3 mt-3">
        <Chip label={risk} color={color} />
        <Chip label={`Score ${score.toFixed(0)}/100`} color="#6b7280" />
      </div>
    )
  }
  if (module === 'speech') {
    const rate = result?.positive_rate
    if (rate == null) return null
    const sev = rate >= 0.50 ? 'Severe' : rate >= 0.25 ? 'Moderate' : rate >= 0.10 ? 'Mild' : 'Minimal'
    const color = rate >= 0.50 ? '#dc2626' : rate >= 0.25 ? '#ea580c' : rate >= 0.10 ? '#ca8a04' : '#16a34a'
    return (
      <div className="flex flex-wrap gap-3 mt-3">
        <Chip label={sev} color={color} />
        <Chip label={`SLD ${(rate * 100).toFixed(1)}%`} color="#6b7280" />
        {result?.prediction && <Chip label={result.prediction === 'stuttering_detected' ? 'Stuttering Detected' : 'Fluent'} color="#6b7280" />}
      </div>
    )
  }
  return null
}

function Chip({ label, color }) {
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full border"
      style={{ color, borderColor: `${color}50`, background: `${color}12` }}
    >
      {label}
    </span>
  )
}

function ReportCard({ report }) {
  const [open, setOpen] = useState(false)
  const meta = MODULE_META[report.module] || { label: report.module, accent: '#6b7280', icon: '📄' }

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: `${meta.accent}18` }}
          >
            {meta.icon}
          </div>
          <div>
            <p className="font-bold text-[#1a1a2e] text-base">{report.child_name}</p>
            <p className="text-sm" style={{ color: meta.accent }}>{meta.label} · Age {report.child_age}</p>
            <ReportSummary result={report.result} module={report.module} />
          </div>
        </div>
        <div className="text-right ml-4 flex-shrink-0">
          <p className="text-xs text-gray-400 mb-2">{fmt(report.created_at)}</p>
          <span className="text-lg font-bold" style={{ color: meta.accent }}>
            {open ? '−' : '+'}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-[#e5e7eb] px-6 py-5 bg-gray-50">
          <DetailView result={report.result} module={report.module} accent={meta.accent} />
        </div>
      )}
    </div>
  )
}

function DetailView({ result, module, accent }) {
  if (module === 'asd') {
    const pred = result?.prediction
    const rep  = result?.report
    return (
      <div className="space-y-3 text-sm text-gray-700">
        {pred && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { k: 'Prediction', v: pred.prediction },
              { k: 'Confidence', v: pred.confidence != null ? `${(pred.confidence * 100).toFixed(0)}%` : '—' },
              { k: 'AQ-10 Score', v: pred.aq10_score ?? '—' },
              { k: 'Gaze Score', v: pred.p_gaze != null ? pred.p_gaze.toFixed(3) : '—' },
            ].map(({ k, v }) => (
              <div key={k} className="bg-white rounded-xl border border-[#e5e7eb] p-3 text-center">
                <p className="text-xs text-gray-500">{k}</p>
                <p className="font-bold text-[#1a1a2e]">{String(v)}</p>
              </div>
            ))}
          </div>
        )}
        {rep?.summary && (
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <p className="text-xs font-semibold text-gray-500 mb-1">SUMMARY</p>
            <p className="leading-relaxed">{rep.summary}</p>
          </div>
        )}
      </div>
    )
  }

  if (module === 'dysgraphia') {
    return (
      <div className="space-y-3 text-sm text-gray-700">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { k: 'Final Score', v: result?.finalScore != null ? `${result.finalScore.toFixed(0)}/100` : '—' },
            { k: 'Questionnaire', v: result?.questionnaireScore != null ? result.questionnaireScore.toFixed(0) : '—' },
            { k: 'Image Anomaly', v: result?.imageAnomalyDetected != null ? (result.imageAnomalyDetected ? 'At Risk' : 'Typical') : '—' },
          ].map(({ k, v }) => (
            <div key={k} className="bg-white rounded-xl border border-[#e5e7eb] p-3 text-center">
              <p className="text-xs text-gray-500">{k}</p>
              <p className="font-bold text-[#1a1a2e]">{v}</p>
            </div>
          ))}
        </div>
        {result?.detailedAnalysis && (
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 max-h-64 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 mb-1">AI ANALYSIS</p>
            <p style={{ whiteSpace: 'pre-line', lineHeight: '1.7' }}>{result.detailedAnalysis}</p>
          </div>
        )}
      </div>
    )
  }

  if (module === 'speech') {
    return (
      <div className="space-y-3 text-sm text-gray-700">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { k: 'SLD Rate', v: result?.positive_rate != null ? `${(result.positive_rate * 100).toFixed(1)}%` : '—' },
            { k: 'Prediction', v: result?.prediction === 'stuttering_detected' ? 'Stuttering' : 'Fluent' },
            { k: 'Confidence', v: result?.confidence ?? '—' },
            { k: 'Duration', v: result?.duration_sec != null ? `${result.duration_sec}s` : '—' },
          ].map(({ k, v }) => (
            <div key={k} className="bg-white rounded-xl border border-[#e5e7eb] p-3 text-center">
              <p className="text-xs text-gray-500">{k}</p>
              <p className="font-bold text-[#1a1a2e]">{String(v)}</p>
            </div>
          ))}
        </div>
        {result?.narrative && (
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 max-h-64 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 mb-1">AI ANALYSIS</p>
            <p style={{ whiteSpace: 'pre-line', lineHeight: '1.7' }}>{result.narrative}</p>
          </div>
        )}
      </div>
    )
  }

  return <p className="text-gray-500 text-sm">No detail available.</p>
}

export default function ReportsPage() {
  const { token } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    fetchReports(token).then(r => { setReports(r); setLoading(false) })
  }, [token])

  const modules = ['all', 'asd', 'dysgraphia', 'speech']
  const visible = filter === 'all' ? reports : reports.filter(r => r.module === filter)

  // Group by child name
  const grouped = visible.reduce((acc, r) => {
    const key = r.child_name
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[#f7f8fc]">
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1a1a2e]">Screening Reports</h1>
            <p className="text-gray-500 mt-1">All past assessments saved to your account</p>
          </div>
          <Link
            to="/home"
            className="text-sm font-medium px-4 py-2 rounded-lg border border-[#e5e7eb] hover:bg-white transition text-gray-600"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {modules.map(m => {
            const meta = MODULE_META[m]
            const active = filter === m
            return (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold border transition"
                style={active
                  ? { background: meta?.accent || '#1a1a2e', color: '#fff', borderColor: meta?.accent || '#1a1a2e' }
                  : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }
                }
              >
                {meta?.icon} {meta?.label || 'All Modules'}
              </button>
            )
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading reports…</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-gray-500 font-medium">No reports yet.</p>
            <p className="text-gray-400 text-sm mt-1">Complete a screening to see results here.</p>
            <Link
              to="/home"
              className="inline-block mt-6 px-6 py-2.5 bg-[#00c9a7] text-white rounded-lg font-semibold hover:bg-[#00b396] transition"
            >
              Start a Screening
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([childName, childReports]) => (
              <div key={childName}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">👤</span>
                  <h2 className="font-bold text-[#1a1a2e] text-lg">{childName}</h2>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {childReports.length} report{childReports.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-3">
                  {childReports.map(r => <ReportCard key={r.id} report={r} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
