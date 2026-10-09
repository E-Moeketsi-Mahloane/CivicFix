import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import type { Report } from '../types'

export function ReportMap({ reports }: { reports: Report[] }) {
  const validReports = reports.filter((report) => Number.isFinite(report.latitude) && Number.isFinite(report.longitude))

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <MapContainer
        center={[-26.1719, 28.0107]}
        zoom={11}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {validReports.map((report) => (
          <Marker key={report.id} position={[report.latitude, report.longitude]}>
            <Popup>
              <div className="space-y-1 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{report.title}</p>
                <p>{report.referenceNumber}</p>
                <p>{report.category}</p>
                <p>{report.locationDescription}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
