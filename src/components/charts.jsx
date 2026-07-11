import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// shared theme tokens for recharts (kept in sync with styles.css)
export const CHART = {
  grid: '#273140', axis: '#647085',
  accent: '#4f8cff', low: '#4f8cff', medium: '#d9a72a', high: '#ef8f4a', critical: '#f0524f',
  green: '#35c07a',
}
export const SEV_COLORS = { Low: CHART.low, Medium: CHART.medium, High: CHART.high, Critical: CHART.critical }
const tip = { background: '#171e2b', border: '1px solid #354256', borderRadius: 8, fontSize: 12 }

export function Card({ title, subtitle, children, wide }) {
  return (
    <div className={`card dash-card${wide ? ' wide' : ''}`}>
      {title && <div className="dash-card-head">
        <div className="dash-card-title">{title}</div>
        {subtitle && <div className="dash-card-sub">{subtitle}</div>}
      </div>}
      {children}
    </div>
  )
}

// vertical bar chart from [{name, value}] or stacked severity rows
export function BarCard({ title, subtitle, data, xKey, bars, color = CHART.accent, height = 210 }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: CHART.axis, fontSize: 11 }} interval={0} />
          <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} allowDecimals={false} />
          <Tooltip contentStyle={tip} labelStyle={{ color: '#93a0b3' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          {bars
            ? bars.map((b) => <Bar key={b.key} dataKey={b.key} stackId="s" fill={b.color} radius={b.last ? [3, 3, 0, 0] : 0} />)
            : <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={46} />}
          {bars && <Legend wrapperStyle={{ fontSize: 11 }} />}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

// horizontal bar (good for ranked lists like equipment)
export function HBarCard({ title, subtitle, data, height = 210 }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" tick={{ fill: CHART.axis, fontSize: 11 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fill: CHART.axis, fontSize: 11 }} width={120} />
          <Tooltip contentStyle={tip} labelStyle={{ color: '#93a0b3' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="value" fill={CHART.accent} radius={[0, 3, 3, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

// donut with a centered figure
export function DonutCard({ title, subtitle, data, centerLabel, centerValue, height = 210 }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
              {data.map((d, idx) => <Cell key={idx} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <div className="donut-value mono">{centerValue}</div>
          <div className="donut-label">{centerLabel}</div>
        </div>
      </div>
    </Card>
  )
}
