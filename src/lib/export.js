// export.js -- turn a report object ({ title, columns, rows }) into a
// downloadable Excel or PDF file, entirely in the browser.
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export function exportExcel(report) {
  const data = report.rows.map((r) => {
    const o = {}
    for (const c of report.columns) o[c.label] = r[c.key]
    return o
  })
  const ws = XLSX.utils.json_to_sheet(data, { header: report.columns.map((c) => c.label) })
  // reasonable column widths
  ws['!cols'] = report.columns.map((c) => ({ wch: Math.max(10, Math.min(40, c.label.length + 2)) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, (report.sheet || 'Report').slice(0, 31))
  XLSX.writeFile(wb, `${report.file}.xlsx`)
}

export function exportPdf(report) {
  const doc = new jsPDF({ orientation: report.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  doc.setFontSize(15); doc.setTextColor(20)
  doc.text(report.title, 14, 16)
  if (report.subtitle) { doc.setFontSize(9); doc.setTextColor(120); doc.text(report.subtitle, 14, 22) }
  doc.setFontSize(8); doc.setTextColor(150)
  doc.text('Bharat Thermal Power · PPMS (demo)', 14, report.subtitle ? 27 : 22)

  autoTable(doc, {
    startY: report.subtitle ? 31 : 26,
    head: [report.columns.map((c) => c.label)],
    body: report.rows.map((r) => report.columns.map((c) => {
      const v = r[c.key]
      return v == null ? '' : String(v)
    })),
    styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [79, 140, 255], textColor: 255, fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  })
  doc.save(`${report.file}.pdf`)
}

// build the report object for a given id from prepared data
export function buildReport(id, builders, ctx) {
  const { sites, units, issues, perf, kpiDefs } = ctx
  switch (id) {
    case 'monthly': return builders.monthlyPerformance(sites, perf, kpiDefs)
    case 'scorecard': return builders.plantScorecard(sites, issues)
    case 'deviation': return builders.kpiDeviation(units, perf, kpiDefs)
    case 'closure': return builders.issueClosure(issues)
    case 'rca': return builders.rcaSummary(issues)
    case 'dept': return builders.deptPerformance(issues)
    default: return null
  }
}
