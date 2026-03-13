# **Technical Feasibility Study: Sovereign Watch Distributed GIS Architecture**

## **1\. Executive Strategy and Architectural Validity Assessment**

### **1.1 Scope, Mandate, and Strategic Imperative**

This comprehensive technical audit and implementation strategy evaluates the "Sovereign Watch" architectural blueprint—a proposed high-fidelity, resilient geospatial intelligence (GIS) system designed to render over 100,000 dynamic tactical entities at 60 frames per second (FPS). The mandate is to assess the viability of the proposed technology stack, which integrates **React 19** for user interface concurrency, **Deck.gl v9** for GPU-accelerated visualization, **Redpanda** for low-latency data streaming, and **WebLLM** for client-side artificial intelligence.  
The core operational requirement is "Data Sovereignty," defined here as the capability to operate independently of centralized cloud providers and commercial data aggregators during disconnected or hostile network conditions. This necessitates a "Local-First" architecture where data ingestion, processing, and rendering occur primarily on the edge (the client device or local tactical server).  
As an API Optimization Engineer, I have conducted a rigorous fact-check of the proposed data pipelines against current browser capabilities, library maturity levels, and commercial API constraints. The analysis reveals that while the strategic vision is sound, the proposed technical configuration contains critical incompatibilities—specifically regarding the integration of **WebGPU** with existing basemap technologies—that require immediate architectural remediation to prevent project failure. Furthermore, the reliance on legacy open-source libraries for tactical message parsing presents a significant maintenance risk that must be addressed through a modernize-or-fork strategy.  
This report provides a granular analysis of these risks, detailed optimization strategies for the high-frequency data pipeline, and a revised implementation roadmap that ensures the system meets its performance targets without succumbing to the bleeding-edge instability of the current Web ecosystems.

### **1.2 Executive Verdict: The "WebGPU Interleaving" Critical Blockade**

The "Sovereign Watch" design blueprint explicitly mandates the use of **Deck.gl v9 with WebGPU** to achieve "hyper-futuristic" visual fidelity and to power "Agent Swarm" visualizations using compute shaders. Simultaneously, it requires **Interleaved Rendering** with Mapbox GL JS (or MapLibre) to ensure that tactical entities (drones, aircraft) are correctly occluded by 3D terrain and buildings.  
**Technical Audit Findings:** The concurrent requirement for WebGPU rendering and Mapbox Interleaving is **currently technically impossible** within a single browser context.

1. **The Context Mismatch:** Interleaved rendering functions by injecting the overlay's draw calls directly into the basemap's render loop. This allows both the map engine and the data visualization layer to share a single depth buffer (Z-buffer), which is essential for determining whether a pixel belongs to a building or a drone flying behind it. Mapbox GL JS v3 and MapLibre GL JS v4 operate exclusively on a WebGL2RenderingContext. Deck.gl's WebGPU backend operates on a GPUCanvasContext. These two contexts are fundamentally incompatible; they cannot share a framebuffer or depth texture without an expensive round-trip copy via the CPU, which would destroy the 60 FPS performance target.  
2. **Library Maturity:** While Deck.gl v9 has introduced experimental WebGPU support, the documentation explicitly states that "Base Map Interleaving" is unsupported (❌ Status) for the WebGPU backend. Furthermore, the MapLibre roadmap indicates that while a native WebGPU backend is in development (with initial commits appearing in late 2025), a stable JavaScript implementation (maplibre-gl-js) supporting WebGPU is not yet production-ready.  
3. **Operational Risk:** Proceeding with the WebGPU requirement as defined in the blueprint will force the application into "Overlaid Mode." In this mode, the tactical layer sits on top of the map like a transparent 2D sheet (the "sandwich problem"). This results in a complete loss of depth perception—drones will appear to float *through* mountains rather than flying *behind* them—violating the "Digital Twin" fidelity requirement.

**Strategic Pivot Recommendation:** To salvage the operational requirements, the project must adopt a **Hybrid Rendering Architecture**. The primary tactical map must remain on **WebGL2** to guarantee depth occlusion with Mapbox/MapLibre. The "Agent Swarm" compute features must either be backported to WebGL2 (using Transform Feedback) or run in a separate, non-interleaved WebGPU context that acts solely as a calculation engine, transferring position data back to the WebGL2 renderer. This report details the implementation of this hybrid path in Section 2\.

### **1.3 The "Data Sovereignty" Economic & Operational Validation**

The blueprint's "Fediverse of Things" approach—ingesting raw telemetry from local ADS-B and AIS receivers via Redpanda rather than relying solely on commercial APIs—is validated as the only financially and operationally viable strategy for high-frequency surveillance.

* **Cost Prohibitiveness of Commercial APIs:** Analysis of FlightAware and Flightradar24 pricing models confirms that continuous, high-frequency polling (e.g., 1Hz updates for 10,000 entities) creates unsustainable costs. Even with FlightAware's 94% volume discount, tracking a modest fleet of 100 aircraft continuously costs approximately **$1,296/month**. Scaling this to a global or theater-wide surveillance picture (10,000+ entities) pushes monthly operational expenditure (OpEx) into the six-figure range.  
* **Latency Penalties:** Commercial aggregation APIs introduce a latency floor of 30–60 seconds due to their internal processing and distribution queues. For a tactical "Cursor on Target" application, this latency renders the data operationally obsolete for intercept scenarios.  
* **The Sovereign Advantage:** By deploying local ingestion nodes (RTL-SDR receivers feeding Redpanda), the system achieves sub-second latency (\<200ms) at a zero marginal cost per message. This confirms the architectural decision to prioritize a self-hosted ingestion pipeline.

## **2\. The Rendering Core: Deck.gl, WebGL2, and the Interleaving Challenge**

The visual fidelity of Sovereign Watch depends entirely on the seamless integration of dynamic tactical data with static 3D geospatial environments. The user must perceive tracks as physical objects inhabiting the world, not merely icons floating above it. This section dissects the rendering architecture required to achieve this.

### **2.1 The Physics of Interleaved Rendering**

Standard web mapping often defaults to "Overlaid Mode," where the WebGL data layer (Deck.gl) renders into a transparent canvas stacked physically above the basemap canvas (Mapbox) in the DOM. While simpler to implement, this creates the "sandwich problem": visual dissociation where 3D depth cues are lost.  
To achieve the "Digital Twin" aesthetic, the system must utilize **Interleaved Mode**. In this configuration, Deck.gl does not own its own canvas. Instead, using the MapboxOverlay class, it hooks into the Mapbox GL JS CustomLayerInterface.

* **Mechanism:** Deck.gl injects its draw commands into the specific render phases of the Mapbox loop (e.g., renderingMode: '3d').  
* **Shared Depth Buffer:** Crucially, this allows Deck.gl to read the current value of the Mapbox Depth Buffer (Z-buffer). When Mapbox renders a skyscraper, it writes the depth of that building's pixels to the buffer. If Deck.gl subsequently attempts to render a tactical drone at the same screen coordinate, the GPU performs a depth test. If the building's depth value is "closer" to the camera than the drone's depth value, the drone's pixels are discarded.  
* **Result:** This creates pixel-perfect occlusion. A drone flying at 50m altitude will visually disappear behind a 100m building as the camera rotates, providing intuitive line-of-sight analysis to the operator without requiring complex raycasting calculations.

### **2.2 The WebGPU Incompatibility Deep Dive**

The blueprint's insistence on WebGPU for this specific layer is the primary technical flaw.

#### **2.2.1 Context Isolation & Resource Sharing**

Browser security models and graphics driver architectures strictly isolate WebGL2RenderingContext (OpenGL ES 3.0 based) from GPUCanvasContext (Vulkan/Metal/DirectX 12 based).

* **No Shared State:** A WebGL texture or framebuffer cannot be bound to a WebGPU pipeline, nor vice-versa, without reading the pixels back to the CPU memory and re-uploading them. This "read-back" operation involves synchronizing the GPU and CPU, which stalls the pipeline and introduces massive latency, rendering 60 FPS impossible.  
* **Basemap Limitation:** Mapbox GL JS v3 and MapLibre GL JS are fundamentally WebGL2 engines. They compile GLSL shaders and issue WebGL draw calls. They have no mechanism to accept a WebGPU render pass or share their depth buffer with a WebGPU context.

#### **2.2.2 Browser Context Limits**

Even if we abandoned interleaving and attempted to run WebGPU alongside WebGL in separate canvases (Overlaid Mode), we face browser resource limits.

* **Chrome/Safari Limits:** Chromium-based browsers historically limit the number of active WebGL contexts per tab (often to 16). While WebGPU contexts do not currently share this specific limit, running two heavy 3D contexts (one WebGL for Mapbox, one WebGPU for Deck.gl) creates immense VRAM pressure.  
* **VRAM Contention:** A high-fidelity 3D city map with terrain can consume 2-3 GB of VRAM. A large WebGPU visualization buffer adds to this. On consumer hardware (like a MacBook Air with 8GB unified memory), this dual-context approach significantly increases the risk of tab crashes due to Out-Of-Memory (OOM) errors.

### **2.3 The Hybrid Rendering Strategy: Implementation Plan**

To resolve this, we define a "Hybrid" path that respects the limits of current technology while preparing for the future.

#### **2.3.1 Primary Tactical Layer: Optimized WebGL2**

The core tactical display (icons, tracks, polygons) will use Deck.gl's **WebGL2** backend.

* **Compatibility:** This ensures full compatibility with Mapbox interleaved: true.  
* **Performance:** For standard geometry rendering (triangles, points), WebGL2 is highly performant. The bottleneck is usually CPU-side data preparation, not GPU draw calls. By using **Binary Data Attributes** (discussed in Section 5), we can push 100,000+ vertices to the GPU via WebGL2 with negligible overhead.

#### **2.3.2 Computational Layer: "Invisible" WebGPU**

The "Agent Swarm" feature, which requires complex Boids simulation (flocking, separation, alignment), is computationally expensive on the CPU. We will leverage WebGPU here strictly as a **Compute Engine**, not a Render Engine.

* **Compute Shader:** We write a WGSL compute shader to update the positions of 100,000 swarm particles. This runs on a GPUDevice created without a canvas (headless).  
* **Data Readback:** The compute shader writes the new positions to a GPUBuffer. We map this buffer to read it back to JavaScript.  
* **Transfer:** We transfer this position array (as a Float32Array) to the WebGL2 layer as a binary attribute update.  
* **Latency Mitigation:** While readback has a cost, modern "Async Buffer Mapping" in WebGPU is efficient. If the transfer takes \>16ms, we decouple the physics tick rate (e.g., 30Hz) from the render frame rate (60Hz), interpolating positions visually.

### **2.4 Rendering Queue & Layer Prioritization**

To prevent "Death by Data," we implement a rigorous Level of Detail (LOD) and prioritization strategy.

| Priority | Layer Name | Technology | Update Frequency | Optimization Technique |
| :---- | :---- | :---- | :---- | :---- |
| **P1 (Low)** | **Heatmap/History** | WebGL2 HeatmapLayer | Static / 10s | **GPU Aggregation**: Renders density into an off-screen texture. Cheap to composite. |
| **P2 (Med)** | **Mass Tracks** | WebGL2 ScatterplotLayer | 1Hz | **Instanced Rendering**: Single draw call for 100k points. **Binary Attributes** for zero-copy updates. |
| **P3 (High)** | **Focused Units** | WebGL2 IconLayer | 50Hz | **Texture Atlas**: Pre-packed sprite sheet. **Auto-packing** disabled to save CPU. |
| **P4 (Crit)** | **Interactions** | WebGL2 ArcLayer | 60Hz | **Dynamic Geometry**: Only renders active selection lines/target locks. |
| **P5 (FX)** | **Agent Swarm** | WebGPU (Compute) | 30Hz | **Compute Shader**: Physics calc on WebGPU, rendered via WebGL2 PointCloudLayer. |

## **3\. The Data Ingestion Pipeline: Redpanda & Benthos**

The backend must act as a high-speed funnel, ingesting chaotic data from the "Fediverse," normalizing it, and shooting it to the client. The choice of Redpanda is validated, but the implementation details regarding message transcoding require precise engineering.

### **3.1 Redpanda: The Edge-Native Backbone**

The decision to use Redpanda over Apache Kafka is architecturally sound for this use case.

* **Thread-per-Core Architecture:** Redpanda uses the Seastar framework to pin threads to CPU cores, minimizing context switches. This results in significantly lower tail latencies (p99) compared to Kafka, which is critical when processing real-time tactical interrupts.  
* **Operational Simplicity:** Being a single binary with no Zookeeper dependency reduces the "ops tax." A tactical team can deploy a Redpanda cluster on a set of 3 Intel NUCs in a backpack, whereas a Kafka cluster would require a rack of servers.

### **3.2 Redpanda Connect (Benthos): The Universal Adapter**

The ingestion layer utilizes **Redpanda Connect** (formerly Benthos). Its role is to sanitize the input before it hits the message bus.

#### **3.2.1 Bloblang: The Mapping Logic**

Redpanda Connect uses **Bloblang** for data transformation. We must write specific mappings to normalize disparate feeds (ADS-B JSON, AIS NMEA, COT XML) into the canonical internal format.  
**Example Bloblang Mapping for ADS-B to Internal:**  
`# Input: Dump1090 JSON`  
`root.uid = this.hex`  
`root.type = "a-f-A" # Standardize as Friendly Air`  
`root.lat = this.lat`  
`root.lon = this.lon`  
`root.speed = this.speed`  
`root.course = this.track`  
`root.alt = this.alt_geom`  
`root.source = "local_sdr_01"`  
`root.timestamp = now()`

#### **3.2.2 The "Dedupe" Processor**

In a mesh network of local receivers, multiple SDRs will pick up the same aircraft broadcast. Without deduplication, the frontend receives triplet messages, tripling the rendering load.

* **Implementation:** Use the Redpanda Connect dedupe processor with a Redis backend or internal memory cache.  
* **Key:** dedupe key: ${\! json("uid") }-${\! json("timestamp") }  
* **Window:** 500ms. If Node A and Node B report the same aircraft within 500ms, only the first message is passed downstream.

### **3.3 Transcoding Strategy: XML to Protobuf**

The military standard **Cursor on Target (CoT)** is natively XML. While human-readable, it is bandwidth-heavy. The report mandates transcoding to **TAK Protocol Version 1 (Protobuf)**.

#### **3.3.1 The Schema Definition (TAK V1)**

Research into the TAK Protocol confirms it uses a specific Protobuf schema. The message structure is vital for compatibility with ATAK/WinTAK clients.  
**Table 1: Bandwidth Efficiency Analysis (XML vs. Protobuf)**

| Metric | CoT XML (Raw) | TAK V1 Protobuf | Efficiency Gain |
| :---- | :---- | :---- | :---- |
| **Payload Size** | \~850 bytes | \~140 bytes | **\~83% Reduction** |
| **Parsing Time (Client)** | \~0.5ms | \~0.05ms | **10x Faster** |
| **Overhead** | Verbose tags | Binary headers | Low |
| **Type Safety** | None (String parsing) | Strict (Typed fields) | High |

#### **3.3.2 The "Magic Byte" Implementation**

A critical detail often missed is the TAK Protocol header. It is not just a raw Protobuf dump.

* **Header Format:** 0xbf (Magic Byte) \+ 0x01 (Version: Protobuf) \+ 0xbf (Magic Byte).  
* **Implementation:** The Redpanda Connect pipeline must explicitly prepend these bytes to the output payload using a bloblang function or a custom plugin, otherwise, standard TAK clients (ATAK) will reject the stream as malformed.

## **4\. Global Intelligence & API Economics**

While "Sovereignty" implies local data, global situational awareness requires filling the gaps with commercial data. A cost-benefit analysis of the major providers reveals significant variance in pricing models.

### **4.1 FlightAware (AeroAPI) Analysis**

FlightAware offers a sophisticated, volume-discounted model suitable for enterprise scale.  
**Table 2: FlightAware Cost Analysis (Monthly)**

| Tier / Usage | Rate per Query | 10k Queries/Mo | 1M Queries/Mo | 10M Queries/Mo |
| :---- | :---- | :---- | :---- | :---- |
| **Simple (Lookup)** | $0.001 | $10 | $1,000 | $2,500 (w/ discount) |
| **Standard (Pos)** | $0.005 | $50 | $5,000 | **$1,300 (Effective)** |
| **Complex (Count)** | $0.100 | $1,000 | $100,000 | Negotiated |

* **The "Firehose" Option:** For tracking 10,000+ aircraft, polling the API (Request/Response) is inefficient. The **Firehose API** pushes data via TCP. Pricing is opaque/enterprise-only (typically starting at $1,500/mo) but allows for unlimited consumption within a region.  
* **The "Feeder" Loophole:** Hosting a FlightFeeder grants a free **Enterprise Account** (value \~$89.95/mo). This unlocks historical data and higher rate limits, making it a mandatory step for any cost-conscious deployment.

### **4.2 Flightradar24 (FR24) Analysis**

Flightradar24 uses a rigid subscription model which is less flexible for programmatic scaling.

* **Advanced Plan:** $900/month for 4 million queries. This effectively caps the update rate. Tracking a global fleet of 10,000 aircraft at 1 update/minute would consume 14.4 million queries/day, far exceeding the quota.  
* **Verdict:** Flightradar24 is excellent for manual analysis (human looking at a screen) but cost-prohibitive for high-frequency algorithmic ingestion compared to FlightAware's Firehose.

### **4.3 MarineTraffic vs. VesselFinder**

The maritime data landscape is shifting.

* **MarineTraffic:** Has moved to a "Solutions" model, deprecating simple credit packs. API access is now a high-friction enterprise sales process.  
* **VesselFinder:** Remains developer-friendly with a clear credit-based system.  
  * **Cost:** 50,000 credits for €1,470.  
  * **Flexibility:** Allows purchasing specific datasets (AIS, Voyage, Master Data) a la carte.  
* **Recommendation:** For the "Sovereign Watch" maritime layer, **VesselFinder** is the preferred commercial fallback due to pricing transparency, while the primary data should come from a local network of **AISHub** feeders (community sharing).

### **4.4 The "Fediverse" Hardware ROI**

Building a proprietary receiver network is the ultimate sovereignty play.

* **Node BOM (Bill of Materials):**  
  * Raspberry Pi 4 / Orange Pi 5: $60  
  * RTL-SDR V3 Dongle: $35  
  * 1090MHz Antenna: $40  
  * Case/Power: $15  
  * **Total:** \~$150 per node.  
* **ROI Calculation:** Deploying 100 nodes costs $15,000 (Capex). This equals roughly **10 months** of a commercial Firehose subscription ($1,500/mo). After Year 1, the sovereign network is effectively free (minus minimal electricity/backhaul).  
* **Operational Benefit:** Local nodes provide **raw I/Q data**, allowing for advanced signal analysis (e.g., detecting jamming or spoofing) that processed commercial APIs filter out.

## **5\. Client-Side Optimization: The "Zero-Copy" React Architecture**

Updating 100,000 UI elements at 60 FPS in a browser requires breaking the rules of standard React development. We must bypass the React reconciliation process entirely for the map loop.

### **5.1 The "Transient Update" Pattern**

React's useState triggers a re-render of the component tree. Even with React 19's optimizations, diffing a tree of 100,000 components is too slow (100ms+ per frame).

* **The Store:** We use a mutable store (like **Zustand** with subscribe or a simple useRef) that exists outside React's render cycle.  
* **The Loop:** A requestAnimationFrame loop runs independently. It reads from the store and writes directly to the Deck.gl layer props.  
* **React's Role:** React is relegated to handling the *static* UI (menus, sidebars). The map is treated as a "black box" canvas that React mounts once and then ignores.

### **5.2 Binary Data Attributes: Transferable Objects**

This is the single most critical optimization for the renderer.

* **Standard JSON:** \[{x:1, y:2}, {x:3, y:4}...\]. The browser must allocate 100,000 objects, generating massive Garbage Collection (GC) pressure. CPU usage spikes parsing this structure.  
* **Typed Arrays:** Float32Array(\[1, 2, 3, 4...\]). This is a contiguous block of memory.  
* **Zero-Copy Transfer:** When the Web Worker decodes the Protobuf message, it creates this Float32Array. Using postMessage(data, \[data.buffer\]), the worker **transfers** ownership of that memory block to the main thread.  
  * **Implication:** The data is *moved*, not *copied*. The operation takes constant time (O(1)) regardless of data size (1MB or 100MB takes the same \~0.1ms).  
  * **Deck.gl Integration:** We pass this array directly to the getPosition attribute of the ScatterplotLayer. The GPU reads strictly from this buffer. The JS CPU overhead drops to near zero.

### **5.3 The tak.js Library Audit**

The report suggests using tak.js. A security and maintenance audit reveals risks.

* **Status:** The library vidterra/tak.js hasn't seen significant updates in years and is effectively in maintenance mode.  
* **Protobuf Support:** It relies on older protobufjs versions and may not support the latest TAK protocol extensions.  
* **Recommendation:** **Do not use tak.js directly.** Instead, generate a lightweight parser using protobufjs (v7+) and the official .proto files extracted from the ATAK Civilian source code. This ensures compatibility and allows for tree-shaking unused message types to keep the bundle size small (critical for PWA performance).

## **6\. Artificial Intelligence & Edge Computing**

The "Inference Sovereignty" requirement pushes Large Language Models (LLMs) to the browser. This creates a resource contention war between the 3D Map and the AI.

### **6.1 The VRAM Battleground**

* **Map Consumption:** A 3D city scene with 100k entities, terrain, and shadows can consume **2-4 GB of VRAM**.  
* **LLM Consumption:** A quantized Llama-3-8B (q4f32\_1) model requires roughly **5-6 GB of VRAM**.  
* **Browser Constraints:** Mobile browsers (iOS Safari, Android Chrome) enforce strict memory limits per tab. On an iPad Pro or a standard laptop with 8GB/16GB shared memory, running both the Map and the 8B LLM simultaneously is a guaranteed recipe for a **Tab Crash (OOM)**.

### **6.2 The Three-Tier AI Strategy**

To prevent crashes, we implement a tiered fallback strategy.  
**Table 3: Hybrid AI Architecture**

| Tier | Environment | Model | Use Case | Constraints |
| :---- | :---- | :---- | :---- | :---- |
| **1\. Sovereign (Browser)** | WebGPU | **Phi-3-Mini (3.8B)** or **Gemma-2B** | Simple filtering ("Show hostiles"), UI assistance. | Low VRAM (\<2GB). Limited reasoning. |
| **2\. Edge (Local)** | Local Server (Ollama) | **Llama-3-70B** | Tactical analysis ("Predict enemy movement"). | Requires LAN connection. High latency (network). |
| **3\. Cloud (API)** | OpenAI/Anthropic | **GPT-4o** | Strategic synthesis ("Draft situation report"). | "Go Online" auth required. Breaks sovereignty. |

### **6.3 Agent Swarm Visualization**

The "Agent Swarm" is a visual metaphor for AI processing. Since we cannot use WebGPU interleaving, we implement this as follows:

1. **Simulation:** Run the Boids/Swarm physics in a **Web Worker** using WASM (Rust) or a headless WebGPU compute shader.  
2. **Rendering:** Stream the particle positions to a standard Deck.gl PointCloudLayer (WebGL2).  
3. **Visual Trick:** Use additive blending and a custom shader to make the particles look like glowing energy (Electric Violet). Because they are "holographic" representations of AI thought, they *should* appear overlaid on the terrain, so the lack of depth occlusion is actually a design feature, not a bug.

## **7\. Operational Resilience & Security**

### **7.1 "Go Dark" Capability (Offline MVT)**

Operating without internet mandates local map data.

* **Vector Tiles (MVT/PBF):** We use Mapbox Vector Tiles because they are stylable on the client. A 100MB PBF archive can cover a city at street level detail, whereas raster tiles would be Gigabytes.  
* **Service Worker:** A custom ServiceWorker intercepts network requests for mapbox.com. If the device is offline, it serves the tile PBF from the browser's CacheStorage.  
* **UX:** The user selects a "Mission Box" (AO) and clicks "Download." The backend generates the tile pyramid and streams the PBFs to the client cache.

### **7.2 OPSEC of Local AI**

Running the AI locally (Tier 1\) provides maximum Operational Security (OPSEC). Prompts like "Identify potential ambush points along Route Irish" never leave the device RAM. This is a critical selling point for defense/tactical clients that cannot use ChatGPT due to data leakage risks.

## **8\. Implementation Roadmap**

This phased roadmap prioritizes stability and core competence before introducing experimental features.

### **Phase 1: The Resilient Core (Weeks 1-4)**

* **Objective:** 60 FPS rendering of 10k entities.  
* **Tech:** React 19, Deck.gl (WebGL2 Mode), Mapbox GL JS v3.  
* **Key Task:** Implement the **Zero-Copy Animation Loop**. Build the binary data transfer from Web Worker to Deck.gl.  
* **Checkpoint:** Validate "Interleaved" depth occlusion works.

### **Phase 2: The Sovereign Pipeline (Weeks 5-8)**

* **Objective:** End-to-end data flow from SDR to Screen.  
* **Tech:** Redpanda, Benthos (Protobuf Transcoding).  
* **Key Task:** Deploy Redpanda Connect with custom Bloblang mappings for CoT-to-Protobuf. Replace tak.js with a custom protobufjs generator.  
* **Checkpoint:** Latency test (Sensor \-\> Screen \< 200ms).

### **Phase 3: Intelligence & Hybrid AI (Weeks 9-12)**

* **Objective:** Local inference without crashing.  
* **Tech:** WebLLM (Phi-3-Mini), Ollama Integration.  
* **Key Task:** Implement the "AI Tier Selector" logic. Build the Agent Swarm visualizer using the "Overlay" method.  
* **Checkpoint:** Stress test on 16GB RAM laptop (Map \+ AI running).

### **Phase 4: Field Hardening (Weeks 13-16)**

* **Objective:** Disconnected Operations.  
* **Tech:** Service Workers, IndexedDB, PWA Manifest.  
* **Key Task:** Build the "Offline Region Downloader" for MVT tiles. Implement "Neon Noir" post-processing (CSS filters).  
* **Checkpoint:** Full "Air Gap" test (Pull the ethernet/WiFi and run a mission).

## **Conclusion**

The "Sovereign Watch" project is technically feasible but requires a disciplined departure from the "all-WebGPU" hype. By acknowledging the incompatibility of WebGPU interleaving and adopting a robust **WebGL2 map core**, the project can secure its critical visual requirements immediately. The combination of **Redpanda's low-latency streaming**, **Protobuf's efficiency**, and **React 19's concurrency** forms a "military-grade" backbone capable of handling the high-stakes demands of modern geospatial intelligence. This architecture delivers not just a futuristic aesthetic, but a resilient, sovereign operational capability.

#### **Works cited**

1\. WebGPU \- Deck.gl, https://deck.gl/docs/developer-guide/webgpu 2\. Using with Mapbox \- Deck.gl, https://deck.gl/docs/developer-guide/base-maps/using-with-mapbox 3\. MapLibre Newsletter September 2025, https://maplibre.org/news/2025-10-04-maplibre-newsletter-september-2025/ 4\. CustomLayerInterface \- MapLibre GL JS, https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/ 5\. WebGPU support? · Issue \#9646 · mapbox/mapbox-gl-js \- GitHub, https://github.com/mapbox/mapbox-gl-js/issues/9646 6\. From WebGL to WebGPU | Chrome for Developers, https://developer.chrome.com/docs/web-platform/webgpu/from-webgl-to-webgpu 7\. WebGL Context Limit : r/firefox \- Reddit, https://www.reddit.com/r/firefox/comments/7m6iph/webgl\_context\_limit/ 8\. It is time to remove the 4G/tab limitation \[40691287\] \- Issues \- chromium, https://issues.chromium.org/40691287 9\. Maximum amount of consumable memory per tab \- Google Groups, https://groups.google.com/a/chromium.org/g/chromium-dev/c/IKZvzuBP9QE 10\. What's New | deck.gl, https://deck.gl/docs/whats-new 11\. AndroidTacticalAssaultKit-CIV/takproto/README.md at main \- GitHub, https://github.com/deptofdefense/AndroidTacticalAssaultKit-CIV/blob/master/takproto/README.md 12\. De-mystifying the tak protocol \- Ballantyne Cyber Blog, https://www.ballantyne.online/de-mystifying-the-tak-protocol/ 13\. AeroAPI | Flight status & tracking data API \- FlightAware, https://www.flightaware.com/commercial/aeroapi/ 14\. FlightAware Aviation Data, https://go.flightaware.com/flightaware-aviation-data 15\. FlightFeeder \- ADS-B Receiver \- FlightAware, https://www.flightaware.com/adsb/flightfeeder/ 16\. 22 January 2025 We're removing add-ons and credits from MarineTraffic, https://support.marinetraffic.com/en/articles/10442248-22-january-2025-we-re-removing-add-ons-and-credits-from-marinetraffic 17\. MarineTraffic | Bellingcat's Online Investigation Toolkit \- GitBook, https://bellingcat.gitbook.io/toolkit/more/all-tools/marinetraffic 18\. API for AIS Data \- VesselFinder, https://api.vesselfinder.com/ 19\. Transient Updates | ZUSTAND \- GitHub Pages, https://awesomedevin.github.io/zustand-vue/en/docs/advanced/transiend-updates 20\. tak.js/package.json at main · vidterra/tak.js · GitHub, https://github.com/vidterra/tak.js/blob/main/package.json 21\. Llama 3 8B: Specifications and GPU VRAM Requirements \- ApX Machine Learning, https://apxml.com/models/llama-3-8b 22\. 3W for In-Browser AI: WebLLM \+ WASM \+ WebWorkers \- Mozilla.ai Blog, https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/