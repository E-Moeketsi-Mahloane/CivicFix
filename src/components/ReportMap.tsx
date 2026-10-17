import { divIcon } from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import type { Report } from '../types'

export function ReportMap({ reports }: { reports: Report[] }) {
  const validReports = reports.filter(
    (report): report is Report & { latitude: number; longitude: number } =>
      Number.isFinite(report.latitude) && Number.isFinite(report.longitude),
  )

  return (
    <div className="report-map-container">
      <MapContainer
        center={[-26.02, 28.18]}
        zoom={9}
        scrollWheelZoom
        className="report-map"
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
              <div className="map-popup">
                <p className="map-popup-title">{report.title}</p>
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
