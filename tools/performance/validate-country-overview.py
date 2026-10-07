"""Validate/regenerate topology-safe fallback countries after mapshaper export."""
import json
from pathlib import Path

from shapely.geometry import mapping, shape

root = Path(__file__).resolve().parents[2] / "frontend" / "public"
source = json.loads((root / "world-countries.json").read_text())
overview_path = root / "world-countries-overview.json"
overview = json.loads(overview_path.read_text())
assert len(source["features"]) == len(overview["features"])
fallbacks = []
for original, simplified in zip(source["features"], overview["features"]):
    assert original["properties"] == simplified["properties"]
    original_shape = shape(original["geometry"])
    overview_shape = shape(simplified["geometry"])
    if original_shape.is_valid and not overview_shape.is_valid:
        # Preserve topology within the complete country, including its islands.
        overview_shape = original_shape.simplify(0.01, preserve_topology=True)
        assert overview_shape.is_valid
        simplified["geometry"] = dict(mapping(overview_shape))
        fallbacks.append(original["properties"].get("name"))
    assert original["geometry"]["type"] == simplified["geometry"]["type"]
    if original["geometry"]["type"] == "MultiPolygon":
        assert len(original["geometry"]["coordinates"]) == len(simplified["geometry"]["coordinates"])
    assert not overview_shape.is_empty
    for polygon in (overview_shape.geoms if overview_shape.geom_type == "MultiPolygon" else [overview_shape]):
        assert polygon.exterior.is_closed
output = json.dumps(overview, separators=(",", ":"), ensure_ascii=False)
overview_path.write_text(output)
print(json.dumps({"countries": len(overview["features"]), "topology_fallbacks": fallbacks, "overview_bytes": len(output.encode())}))
