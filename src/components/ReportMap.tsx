import { divIcon } from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import type { Report } from '../types'

export function ReportMap({ reports }: { reports: Report[] }) {
  const validReports = reports.filter(
    (report): report is Report & { latitude: number; longitude: number } =>
      Number.isFinite(report.latitude) && Number.isFinite(report.longitude),
  )

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <MapContainer
        center={[-26.02, 28.18]}
        zoom={9}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {validReports.map((report) => (
          <Marker
            key={report.id}
            position={[
              Math.round(report.latitude * 100) / 100,
              Math.round(report.longitude * 100) / 100,
            ]}
            icon={divIcon({
              className: `civic-map-marker civic-map-marker-${report.category.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`,
              html: '<span></span>',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
          >
            <Popup>
              <div className="space-y-1 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{report.title}</p>
                <p>{report.referenceNumber}</p>
                <p>{report.category}</p>
                <p>{report.community ?? 'General community area'}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
