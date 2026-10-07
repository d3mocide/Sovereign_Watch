/* Reproducible overview asset: mapshaper 0.7.79, installed outside frontend deps. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../frontend/public');
const source = JSON.parse(fs.readFileSync(path.join(root, 'world-countries.json')));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-countries-'));
try {
  const parts = [];
  source.features.forEach((feature, featureIndex) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polygons.forEach((coordinates, partIndex) => parts.push({ type: 'Feature', properties: { featureIndex, partIndex }, geometry: { type: 'Polygon', coordinates } }));
  });
  fs.writeFileSync(path.join(temporary, 'parts.json'), JSON.stringify({ type: 'FeatureCollection', features: parts }));
  execFileSync(process.env.MAPSHAPER_BIN || 'mapshaper', [path.join(temporary, 'parts.json'), '-simplify', 'dp', 'interval=1500', 'keep-shapes', '-o', 'format=geojson', path.join(temporary, 'simplified.json')], { stdio: 'inherit' });
  const simplified = JSON.parse(fs.readFileSync(path.join(temporary, 'simplified.json')));
  if (simplified.features.length !== parts.length) throw new Error('Polygon part count changed');
  const grouped = source.features.map(() => []);
  simplified.features.forEach((part, index) => {
    const { featureIndex, partIndex } = part.properties;
    const geometry = part.geometry || parts[index].geometry;
    // Some source rings normalize to multipart geometry. Keep those source parts
    // exactly rather than silently splitting or removing them in an overview.
    grouped[featureIndex][partIndex] = geometry.type === 'Polygon' ? geometry.coordinates : parts[index].geometry.coordinates;
  });
  const features = source.features.map((feature, index) => ({ ...feature, geometry: { ...feature.geometry, coordinates: feature.geometry.type === 'Polygon' ? grouped[index][0] : grouped[index] } }));
  const output = JSON.stringify({ ...source, features });
  fs.writeFileSync(path.join(root, 'world-countries-overview.json'), output);
  console.log(JSON.stringify({ countries: features.length, polygonParts: parts.length, sourceBytes: fs.statSync(path.join(root, 'world-countries.json')).size, overviewBytes: Buffer.byteLength(output) }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
