# **Sovereign Watch: Strategic Implementation of Distributed Intelligence Ingestion and Fusion Architectures for SIGINT and GEODeC Systems**

## **1\. Architectural Strategy and The Sovereign Mandate**

### **1.1 The Operational Imperative of External Data Fusion**

In the realm of modern geospatial intelligence (GEODeC) and Signals Intelligence (SIGINT), the concept of "Sovereignty" has evolved beyond mere disconnected operation. It now encompasses the ability to selectively ingest, sanitize, and fuse global intelligence from the public internet—the "Fediverse of Data"—into a secure, local-first tactical environment. The "Sovereign Watch" initiative, while grounded in the requirement for sub-200ms latency for local sensor telemetry, acknowledges that no tactical entity operates in a vacuum. The local operating picture must be contextualized within the broader strategic environment: the orbital mechanics of surveillance satellites, the global ebb and flow of electromagnetic interference, and the physics of the ionosphere that dictates communication viability.  
The mandate to integrate external Web APIs with a relevancy window of 1-6 hours fundamentally shifts the engineering paradigm from high-frequency stream processing to robust, scheduled batch ingestion and normalization. This latency tolerance allows for the implementation of a "Pulse Architecture," where the system periodically wakes, negotiates complex authentication handshakes with external providers, ingests massive datasets, and performs heavy computational normalization before returning to a quiescent state. This approach minimizes the digital footprint of the ingestion nodes—critical for forward-deployed infrastructure relying on constrained satellite or cellular backhaul—while ensuring that the local "Digital Twin" remains synchronized with the global reality.  
The architectural challenge lies in the "Normalization Gap." The external data ecosystem is a Tower of Babel: orbital data arrives in legacy XML or JSON from Space-Track , electromagnetic weather data arrives in verbose JSON arrays from NOAA , and spectrum allocations exist as static CSV tables from regulatory bodies like the ITU and FCC. The "Sovereign Watch" internal architecture, however, demands strict adherence to the TAK Protocol Version 1 (Protobuf) to maintain the 60 FPS rendering target on client devices. Consequently, the ingestion layer functions not merely as a conduit but as an active transcoding engine, stripping away the inefficiencies of web-standard formats and injecting highly compressed, type-safe binary payloads into the local Redpanda message bus.

### **1.2 The Ingestion Engine: Redpanda Connect (Benthos)**

The selection of Redpanda Connect (formerly Benthos) as the ingestion backbone is validated by its unique architectural characteristics which align with the "Sovereign" philosophy. Unlike heavy, JVM-based ETL tools like Apache NiFi or Kafka Connect, Benthos operates as a single, static binary with a negligible memory footprint. This allows the ingestion logic to run alongside the message broker on resource-constrained edge hardware (e.g., tactical servers or ruggedized laptops) without competing for the resources required by the visualization engine.  
The "Pulse Architecture" utilizes the generate input mechanism of Benthos, triggered by Cron expressions (e.g., 0 \*/6 \* \* \* for the 6-hour orbital update). This approach decouples the ingestion process from the continuous event loop of the tactical display. By utilizing a "stateless-stateful" pattern—where Benthos temporarily holds session state (like authentication cookies) within the metadata of a single execution pipeline—the system can interact with complex, legacy web APIs without requiring persistent storage of sensitive credentials on the local filesystem, thereby enhancing Operational Security (OPSEC).  
This report serves as the definitive technical blueprint for implementing this external data fusion. It rigorously examines the ingestion of Space Domain Awareness (SDA) data, Environmental factors (Space Weather), and Electromagnetic Spectrum data (SIGINT), detailing the specific API endpoints, authentication flows, and Bloblang transformation logic required to bridge the gap between the chaotic public web and the disciplined "Sovereign Watch" internal protocol.

## **2\. Space Domain Awareness (SDA): Ingesting the Orbital Layer**

### **2.1 Strategic Value of Orbital Data Integration**

The integration of a live orbital layer is non-negotiable for modern tactical operations. Understanding satellite overflight times—Ephemeris data—is critical for two opposing tactical functions: "Windows of Opportunity" for satellite communications (SATCOM) uplink/downlink, and "Windows of Vulnerability" during overflights by hostile Optical or Synthetic Aperture Radar (SAR) reconnaissance platforms. The "Sovereign Watch" application must render over 20,000 Low Earth Orbit (LEO) objects to provide this context. To achieve this without reliance on centralized, third-party visualization servers (like Cesium ion), the system must ingest raw orbital elements and perform propagation locally on the client.

### **2.2 Space-Track.org: The Authoritative Source**

The US Space Force's 18th Space Defense Squadron publishes the authoritative catalog of orbital objects via Space-Track.org. While this data is public for registered users, the API implements a defense-in-depth authentication mechanism that complicates automated ingestion.

#### **2.2.1 The Authentication Challenge: Stateful Session Management**

Unlike modern APIs that utilize long-lived Bearer Tokens or API Keys, Space-Track enforces a session-based flow relying on HTTP Cookies. An ingestion client must first POST credentials to a login endpoint, receive a Set-Cookie header containing a temporary session token, and then present this cookie in the headers of subsequent GET requests to fetch data. The session has a finite lifespan, requiring periodic re-authentication.  
Standard stateless stream processors often fail to handle this "request chaining." However, Redpanda Connect's architecture allows for a **Workflow** or **Branching** pattern to handle this handshake within a single logical transaction, ensuring that the authentication cookie exists only in the volatile memory of the pipeline and is never written to disk.  
**Table 1: Space-Track.org API Specifications**

| Feature | Specification | Constraint/Requirement |
| :---- | :---- | :---- |
| **Base URL** | https://www.space-track.org | Requires TLS 1.2+ |
| **Auth Method** | POST to /ajaxauth/login | Returns Set-Cookie header (PHPSESSID) |
| **Data Format** | JSON (Preferred) or TLE (Legacy) | OMM/JSON maps better to Protobuf |
| **Rate Limit** | \< 30 requests/minute | "Pulse" architecture stays well below this |
| **Access Control** | Registered Account Required | Must manage credentials via Secrets |

\#\#\#\# 2.2.2 The "Login-then-Fetch" Pipeline Architecture The implementation utilizes a Benthos pipeline triggered by a 6-hour cron schedule. The pipeline executes a branch processor to perform the login. This processor isolates the login logic; its output (the cookie) is captured into the metadata of the main message payload, which is then used to construct the subsequent data fetch request.  
**Step 1: The Login Branch** The pipeline creates a temporary message containing the credentials (injected via environment variables for security). It targets the /ajaxauth/login endpoint. The http\_client processor is configured with extract\_headers to capture the Set-Cookie value using a regex pattern. This value is stored in a metadata key, e.g., auth\_cookie.  
**Step 2: The Data Fetch** The main branch of the pipeline then executes a second http\_client request. Crucially, this processor uses Bloblang interpolation in its headers configuration: Cookie: ${\! meta("auth\_cookie") }. This injects the fresh session token into the request. The URL targets the General Perturbations (GP) history class: /basicspacedata/query/class/gp/decay\_date/null-val/epoch/\>now-30/orderby/NORAD\_CAT\_ID/format/json. This query filters for objects that have not decayed (are still in orbit) and have elements updated within the last 30 days, ensuring the dataset remains relevant without fetching the entire history of the space age.

### **2.3 Data Normalization: OMM to TAK Protobuf**

While the legacy Two-Line Element (TLE) format is compact, it is a fixed-width text format that requires specialized parsing. The "Sovereign Watch" architecture favors the **Orbit Mean-Elements Message (OMM)** in JSON format, which Space-Track provides natively. JSON allows for direct, type-safe mapping to the internal TAK Protobuf schema using Bloblang.  
**Bloblang Transformation Strategy:** The ingestion pipeline must transform the flat JSON array from Space-Track into individual TakMessage Protobuf payloads.

1. **Unarchive:** The unarchive processor explodes the JSON array, creating one message per satellite.  
2. **Mapping:**  
   * **UID:** Mapped from NORAD\_CAT\_ID. The TAK uid becomes SAT-{NORAD\_CAT\_ID}.  
   * **Type:** Assigned as a-s-K (Atom-Space-Keplerian).  
   * **Detail:** The critical orbital elements (Inclination, Eccentricity, RAAN, Mean Anomaly, Mean Motion, Drag) are packed into the detail field of the CoT message. For compatibility with existing TAK clients that expect XML in the detail field, the elements are formatted into a compact XML string nested within the Protobuf detail slot.  
   * **Timestamps:** The EPOCH string (e.g., "2026-02-01 12:00:00") is parsed into Unix epoch microseconds to populate the time and start fields. The stale time is calculated as start \+ 24 hours, reflecting the degradation of SGP4 prediction accuracy over time.

### **2.4 Client-Side Visualization: The WebGL2/WebGPU Hybrid**

The "Sovereign Watch" design document identifies a critical conflict: the inability to interleave WebGPU contexts with the WebGL2-based Mapbox/MapLibre basemap. Therefore, the orbital layer must adopt a **Hybrid Architecture**.  
**The Compute/Render Split:** To render 20,000+ satellites at 60 FPS, the CPU cannot handle the SGP4 propagation math for every object per frame.

1. **Compute Shader (WebGPU):** The application utilizes a headless WebGPU ComputeShader running in a Web Worker. This shader accepts the buffer of orbital elements (ingested via the pipeline above) and the current simulation time. It executes the SGP4 algorithm in parallel, outputting a buffer of Cartesian (X, Y, Z) positions.  
2. **Data Transfer:** This position buffer is read back to the CPU as a Float32Array. While "readback" is historically slow, modern asynchronous buffer mapping in WebGPU minimizes this stall.  
3. **Rendering (WebGL2):** The Float32Array is transferred to the main thread (Zero-Copy transfer) and passed directly to a Deck.gl PointCloudLayer or IconLayer. This layer operates in WebGL2 mode, allowing it to utilize the interleaved: true property of the MapboxOverlay. This ensures that satellites correctly disappear behind 3D terrain and buildings, maintaining the "Digital Twin" fidelity requirements.

## **3\. The Electromagnetic Environment: Space Weather Integration**

### **3.1 The Physics of RF Propagation**

For a SIGINT-focused application, the "terrain" includes the ionosphere. Solar activity dictates the range and reliability of HF (High Frequency) communications and the accuracy of GPS. Integrating Space Weather data allows the "Sovereign Watch" map to visualize "Denied Areas"—regions where communications are likely to fail due to solar events.

### **3.2 NOAA SWPC Ingestion Strategy**

The National Oceanic and Atmospheric Administration's Space Weather Prediction Center (SWPC) provides a robust, authentication-free JSON API. This simplifies the ingestion pipeline compared to Space-Track.  
**Key Datasets:**

1. **Planetary K-index (planetary\_k\_index\_1m.json):** A measure of geomagnetic storm intensity. High Kp values (\>5) indicate potential GPS degradation and HF blackouts at high latitudes.  
2. **Solar Flux (f107\_cm\_flux.json):** The 10.7cm radio flux is a proxy for ionospheric density (F-layer). High flux enables long-range HF propagation but increases atmospheric drag on LEO satellites.  
3. **Auroral Oval (ovation\_aurora\_latest.json):** A geometric definition of the auroral zone. Visualizing this allows operators to see the physical extent of the "No-Comms" polar cap absorption region.

### **3.3 Normalization and Visualization**

The NOAA data arrives as time-series arrays. The Benthos pipeline applies a \[span\_4\](start\_span)\[span\_4\](end\_span)\[span\_7\](start\_span)\[span\_7\](end\_span)bloblang mapping to extract the *latest* valid entry (slicing the array) and normalize it into a TakMessage with a specific type code (e.g., b-e-w for Bits-Environment-Weather).  
**Visualization Implementation:**

* **K-Index:** Visualized as a global ambient color filter or a UI status widget (Green/Yellow/Red).  
* **Auroral Oval:** The ovation\_aurora\_latest.json contains coordinate arrays. The client parses this into a GeoJSON Polygon and renders it using a Deck.gl PolygonLayer with a translucent, glowing fill shader (simulating the aurora). This layer is typically static for 30-60 minutes, fitting well within the 1-6 hour relevancy window.

## **4\. Signals Intelligence (SIGINT): The GPS Jamming Landscape**

### **4.1 Crowdsourced Electronic Warfare Detection**

Deploying a global network of spectrum analyzers is cost-prohibitive. However, "Sovereign Watch" can leverage the concept of "Signals of Opportunity." Every commercial aircraft is a flying sensor. By monitoring the integrity metrics of their ADS-B transponders, we can infer the presence of GPS jamming on the ground. This methodology, popularized by GPSJam.org, converts aircraft into a distributed NAVWAR detection network.

#### **4.1.1 The Mathematics of Jamming Detection**

The detection logic relies on two specific ADS-B fields:

* **NIC (Navigation Integrity Category):** A value from 0 to 11 indicating the containment radius of the position. A NIC of 0 indicates the system has no confidence in its position (\> 37 km error or unknown). Normal GPS operation yields NIC values of 8-11 (\< 0.1 nm error).  
* **NACp (Navigation Accuracy Category for Position):** Similar to NIC, indicating the 95% accuracy bound.

**The Inference Algorithm:** Jamming is inferred when multiple aircraft in a specific geographic area simultaneously report **Low NIC/NACp** while maintaining **High Signal Strength (RSSI)** at the receiver. This differentiates jamming (receiver hears the plane, but plane is lost) from coverage gaps (receiver can't hear the plane).  
The formula for the "Jamming Index" (J) for a given hex cell is:  
Where N\_{bad} is the count of aircraft reporting NIC \< 7, and N\_{total} is the total unique aircraft. The subtraction of 1 acts as a denoising filter to prevent single-aircraft avionics failures from triggering a false positive.

### **4.2 ADS-B Ingestion Pipeline**

The system ingests data from **ADS-B Exchange** (ADSBx), chosen for its unfiltered policy regarding military traffic.

* **Endpoint:** ADSBx Rapid Update API (JSON).  
* **Optimization:** Given the high volume (10,000+ aircraft), the ingestion pipeline uses Benthos to fetch the data and immediately aggregate it.  
* **H3 Aggregation:** The pipeline calculates the **H3 Spatial Index** (Resolution 4\) for each aircraft's lat/lon using a Bloblang function or WASM plugin. It then groups the messages by H3 index and calculates the Jamming Index (J) for each hex.  
* **Output:** The pipeline emits a stream of Protobuf messages, where each message represents a Hexagon. The uid is the H3 index, and the type is a custom CoT type for interference. The detail field contains the J value.

### **4.3 Spectrum Context: ElectroSense vs. SatNOGS**

The original request referenced "ElectroSense." A forensic audit of the project status reveals it is largely dormant, with repositories inactive since \~2019. While its architecture (using RTL-SDRs and backend processing) remains a valid reference design for *building* a sensor network, it is not a viable source for *live* data ingestion in 2025\.  
**Strategic Pivot: SatNOGS Integration** **SatNOGS** (Satellite Networked Open Ground Station) represents the active, vibrant alternative. It provides a global network of ground stations uploading waterfall data and demodulated frames.

* **Ingestion:** The Benthos pipeline polls the SatNOGS DB API (/api/observations/) filtering for status=good.  
* **Fusion Value:** This data provides "Ground Truth" for satellite audibility. If the Orbital Layer (Space-Track) predicts a satellite overpass, but the SatNOGS layer shows no signal in the waterfall, it indicates potential localized RF blocking or satellite silence.

## **5\. The Static Baseline: Frequency Allocations**

To interpret SIGINT data, operators need to know "what represents 'normal'?" The **Table of Frequency Allocations** provides this baseline.

* **Data Source:** The FCC and ITU publish these tables. While typically PDFs, machine-readable CSVs and JSONs exist in data catalogs.  
* **Ingestion Strategy:** This is a low-frequency update (yearly). The Benthos pipeline fetches the CSV, transforms it into a **SQLite** database file, and publishes it as a static resource (HTTP Artifact) rather than a stream.  
* **Client Implementation:** The web client downloads this SQLite database and queries it via **sql.js** (WASM). This allows for instant, offline lookups. When a user inspects a signal at 433 MHz, the UI queries the local DB to display "Allocation: Amateur / Radiolocation," without a network round-trip.

## **6\. The "Zero-Copy" Data Pipeline: Implementation Details**

### **6.1 The Pulse Architecture Configuration**

The core of the 1-6 hour relevancy architecture is the Benthos generate input combined with http\_client processors. This avoids the overhead of maintaining persistent WebSocket connections for slow-moving data.  
**Table 2: Pipeline Schedule Strategy**

| Data Source | Pulse Interval | Relevancy Window | Processing Logic |
| :---- | :---- | :---- | :---- |
| **Space-Track** | 6 Hours | Strategic | Login \-\> Fetch GP History \-\> SGP4 Prep \-\> Protobuf |
| **NOAA SWPC** | 1 Hour | Environmental | Fetch JSON \-\> Extract Last \-\> Normalize \-\> Protobuf |
| **ADS-B Jamming** | 15 Minutes | Tactical Warning | Fetch Snapshot \-\> H3 Aggregation \-\> Filter \-\> Protobuf |
| **SatNOGS** | 1 Hour | Verification | Fetch Observations \-\> Filter 'Good' \-\> Protobuf |

### **6.2 Managing State: The Space-Track Cookie Flow**

The most complex pipeline handles Space-Track's session cookie. The configuration uses a branch processor to perform the login side-effect.  
`# Benthos Pipeline Configuration Fragment: Space-Track Auth`  
`pipeline:`  
  `processors:`  
    `# 1. Login Branch: Authenticate and Capture Cookie`  
    `- branch:`  
        `request_map: |`  
          `root = ""`  
          `meta identity = env("ST_USER")`  
          `meta password = env("ST_PASS")`  
        `processors:`  
          `- http:`  
              `url: https://www.space-track.org/ajaxauth/login`  
              `verb: POST`  
              `headers:`  
                `Content-Type: application/x-www-form-urlencoded`  
              `body: "identity=${!meta('identity')}&password=${!meta('password')}"`  
              `# Capture Set-Cookie header for the next step`  
              `extract_headers:`  
                `include_patterns:`  
        `# Map the extracted cookie to the main message metadata`  
        `result_map: 'meta auth_cookie = meta("Set-Cookie")'`

    `# 2. Fetch Branch: Use Cookie to Download Data`  
    `- http:`  
        `url: https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/>now-30/orderby/NORAD_CAT_ID/format/json`  
        `verb: GET`  
        `headers:`  
          `Cookie: ${!meta("auth_cookie")} # Inject the session cookie`  
      
    `# 3. Transform: Explode Array and Map to CoT`  
    `- unarchive:`  
        `format: json_array`  
    `- bloblang: |`  
        `root.cotEvent.type = "a-s-K"`  
        `root.cotEvent.uid = "SAT-" + this.NORAD_CAT_ID`  
        `#... additional mapping logic...`

This configuration ensures robust, automated access to the orbital data without manual intervention or insecure script management.

### **6.3 The TAK Protobuf Header (Magic Bytes)**

A critical implementation detail is the TAK Protocol header. Simply serializing the Protobuf object is insufficient; the byte stream must be prefixed with the specific TAK magic bytes to be recognized by ATAK/WinTAK clients.  
**Header Specification:**

* 0xbf (Start Byte)  
* 0x01 (Version: Protobuf)  
* 0xbf (End Header)

**Benthos Implementation:**  
    `- protobuf_encode:`  
        `message: "atakmap.commoncommo.v1.TakMessage"`  
        `import_paths: [ "./schemas" ]`  
    `# Prepend the 3-byte header to the binary payload`  
    `- bloblang: 'root = "\xbf\x01\xbf" + content()'`

This ensures the output stream is strictly compliant with the TAK standard, allowing for direct multicast or TCP streaming to the client.

## **7\. Visualization: The "Glass" Layer**

### **7.1 Hybrid Rendering: The WebGL2 / WebGPU Compromise**

The "Sovereign Watch" feasibility study correctly identified that **Mapbox GL JS** (the basemap engine) is strictly WebGL2-based and cannot share a depth buffer with a **WebGPU** context. This creates the "Sandwich Problem," where 3D overlays (like satellite orbits) would render on top of mountains rather than behind them, destroying depth perception.  
**The Solution:**

1. **Basemap & Overlays (WebGL2):** The Mapbox basemap and the Deck.gl overlay (rendering satellite points and jamming hexagons) *must* share the same WebGL2 context. This enables interleaved: true, allowing for pixel-perfect depth occlusion.  
2. **Physics Engine (WebGPU):** The heavy lifting—calculating the positions of 20,000 satellites—is offloaded to a **WebGPU Compute Shader** running in a Web Worker. This shader calculates the SGP4 propagation in parallel (massively faster than CPU/JS) and returns a buffer of coordinates.  
3. **Bridge:** The coordinate buffer is transferred to the main thread and passed to the WebGL2 Deck.gl layer as a **Binary Attribute**. This hybrid approach leverages the compute power of WebGPU without breaking the visual integration of the map.

### **7.2 Offline Capability: PMTiles and Service Workers**

To maintain "Sovereignty" (offline capability), the system utilizes **PMTiles** for static data layers (like the Frequency Allocation heatmap and historical jamming data). PMTiles is a single-file archive format that supports HTTP Range Requests.

* **Mechanism:** The Service Worker intercepts requests for map data. If online, it fetches specific byte ranges from the PMTiles archive on the server. If offline, it serves pre-cached ranges. This avoids the need to download gigabytes of data to the client device while still allowing access to global datasets.

## **8\. Conclusion**

The integration of external web APIs into the "Sovereign Watch" architecture transforms the system from a localized sensor display into a comprehensive strategic command interface. By leveraging the **Redpanda Connect** ecosystem, the system bridges the gap between the chaotic, disparate formats of the "Fediverse" (XML, JSON, Cookies) and the disciplined, binary efficiency of the TAK Protocol. The **Pulse Architecture** respects the bandwidth constraints of the tactical edge, while the **Hybrid Rendering** model respects the current limitations of browser graphics engines. This approach delivers a "Digital Twin" that is not only visually high-fidelity but operationally resilient, providing 1-6 hour relevancy for global data without compromising the sub-second latency of local tactical feeds.

#### **Works cited**

1\. Help Documentation \- Space-Track, https://www.space-track.org/documentation 2\. TLE API, https://tle.ivanstanojevic.me/ 3\. Index of /json \- SWPC Services, https://services.swpc.noaa.gov/json/ 4\. Data Access | NOAA / NWS Space Weather Prediction Center, https://www.swpc.noaa.gov/content/data-access 5\. Table of Frequency Allocations Chart \- Federal Communications Commission, https://www.fcc.gov/engineering-technology/policy-and-rules-division/radio-spectrum-allocation/general/table-frequency 6\. RR5 Table of Frequency Allocations Software \- ITU, https://www.itu.int/pub/R-REG-RR5 7\. generate | Redpanda Connect, https://docs.redpanda.com/redpanda-connect/components/inputs/generate/ 8\. command | Redpanda Connect, https://docs.redpanda.com/redpanda-connect/components/processors/command/ 9\. how to save authentication cookie while doing POST login into the server \- Stack Overflow, https://stackoverflow.com/questions/48171679/how-to-save-authentication-cookie-while-doing-post-login-into-the-server 10\. http\_client | Redpanda Connect, https://docs.redpanda.com/redpanda-connect/components/inputs/http\_client/ 11\. shupp/Services\_SpaceTrack: A simple client for authenticating and calling the Space-Track.org API \- GitHub, https://github.com/shupp/Services\_SpaceTrack 12\. The Art Of Scripting HTTP Requests Using curl, https://curl.se/docs/httpscripting.html 13\. branch | Redpanda Connect, https://docs.redpanda.com/redpanda-connect/components/processors/branch/ 14\. Authorization headers are being passed even with 302 to another domain \#792 \- GitHub, https://github.com/Jeffail/benthos/issues/792 15\. TLE Data Access — SatChecker 1.5.0 documentation, https://satchecker.readthedocs.io/en/stable/tools\_tle.html 16\. AndroidTacticalAssaultKit-CIV/takproto/README.md at main \- GitHub, https://github.com/deptofdefense/AndroidTacticalAssaultKit-CIV/blob/master/takproto/README.md 17\. De-mystifying the tak protocol \- Ballantyne Cyber Blog, https://www.ballantyne.online/de-mystifying-the-tak-protocol/ 18\. WebGL2 GPGPU, https://webgl2fundamentals.org/webgl/lessons/webgl-gpgpu.html 19\. WebGPU — From Ping Pong WebGL To Compute Shader 🖥️ | by Phish Chiang \- Medium, https://medium.com/phishchiang/webgpu-from-ping-pong-webgl-to-compute-shader-%EF%B8%8F-1ab3d8a461e2 20\. visgl/deck.gl: WebGL2 powered visualization framework \- GitHub, https://github.com/visgl/deck.gl 21\. Planetary K-index | NOAA / NWS Space Weather Prediction Center, https://www.swpc.noaa.gov/products/planetary-k-index 22\. Visualizing NOAA GloTEC Data To Improve Ionospheric Communication Channels, https://www.youtube.com/watch?v=UCmAg1IHOOk 23\. Complete Global Total Electron Content Map Dataset based on a Video Imputation Algorithm VISTA \- NIH, https://pmc.ncbi.nlm.nih.gov/articles/PMC10130027/ 24\. GPSJAM FAQ, https://gpsjam.org/faq 25\. GNSS interference detection: Methodology utilising ADS-B NACp indicator and GPS almanac data | The Aeronautical Journal \- Cambridge University Press & Assessment, https://www.cambridge.org/core/journals/aeronautical-journal/article/gnss-interference-detection-methodology-utilising-adsb-nacp-indicator-and-gps-almanac-data/72FEBF7BFE1541D7BF146B14BFAA4AB8 26\. Monitoring and Mapping GNSS Interference with ADS-B Data, https://www.gnssjamming.com/post/monitoring-gnss-interference-with-ads-b 27\. ADS-B Exchange \- track aircraft live, https://globe.adsbexchange.com/ 28\. H3: Home, https://h3geo.org/ 29\. GPSJam: Daily Maps of GPS Interference | Hacker News, https://news.ycombinator.com/item?id=32245346 30\. API examples to retrieve spectrum data from electrosense \- GitHub, https://github.com/electrosense/api-examples 31\. Electrosense: Open and Big Spectrum Data \- arXiv, https://arxiv.org/pdf/1703.09989 32\. docs/api.rst · master \- satnogs-network \- GitLab, https://gitlab.com/librespacefoundation/satnogs/satnogs-network/blob/master/docs/api.rst 33\. API — SatNOGS Network 1.113+6.gbc65614.dirty documentation, https://docs.satnogs.org/projects/satnogs-network/en/latest/api.html 34\. Using SDR to make .CSV files for Wireless Workbench : r/RTLSDR \- Reddit, https://www.reddit.com/r/RTLSDR/comments/121xiu9/using\_sdr\_to\_make\_csv\_files\_for\_wireless\_workbench/ 35\. Arrin-KN1E/SDR-Band-Plans: Detailed band plans for SDR Software \- GitHub, https://github.com/Arrin-KN1E/SDR-Band-Plans 36\. CoT xml message (protocol v0) seems to be ignored by Atak 5.4 and WinTak 5.4 \- Reddit, https://www.reddit.com/r/ATAK/comments/1ktlyjn/cot\_xml\_message\_protocol\_v0\_seems\_to\_be\_ignored/ 37\. GlobeView (Experimental) \- Deck.gl, https://deck.gl/docs/api-reference/core/globe-view 38\. PMTiles for MapLibre GL \- Protomaps Docs, https://docs.protomaps.com/pmtiles/maplibre 39\. MapLibre GL JS, https://maplibre.org/maplibre-gl-js/docs/