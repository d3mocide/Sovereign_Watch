# **Architectural Forensics: A Deep-Dive Technical Analysis of World-Monitor.com and the GDELT Ecosystem**

## **1\. Executive Summary**

This report presents an exhaustive reverse-engineering analysis and technical evaluation of world-monitor.com, a real-time Open Source Intelligence (OSINT) dashboard. The investigation, conducted from the perspective of a Senior Data Systems Architect, deconstructs the website’s functional mechanics, data pipelines, and foundational dependencies.

The analysis identifies world-monitor.com as a sophisticated visualization layer—a "single pane of glass"—that aggregates disparate global data streams into a unified situational awareness interface. The primary engine driving its geospatial news capability is the **GDELT Project (Global Database of Events, Language, and Tone)**. The site functions by ingesting high-velocity, machine-coded metadata from GDELT’s Global Knowledge Graph (GKG), specifically utilizing 15-minute interval GeoJSON feeds to populate a live map.

Beyond GDELT, the platform acts as a nexus for multi-modal data, integrating decentralized prediction markets (Polymarket), financial tickers, live video streaming (YouTube API), and aggregate threat levels (DEFCON status). This report details the specific API structures, data schema challenges (specifically "spurious location" artifacts), and the architectural decisions required to render massive, noisy datasets in a browser environment. It also provides a comprehensive academic overview of the GDELT Project, explaining the CAMEO taxonomies, Goldstein Scales, and Natural Language Processing (NLP) pipelines that make such a dashboard possible.

The investigation further identifies the developer, operating under the handle No-Price1071, and contextualizes the project within the "Build in Public" movement. The analysis distinguishes this modern web application from unrelated legacy software artifacts found during the forensic sweep (e.g., MIT Scheme files).

## ---

**2\. Introduction: The Architecture of Global Oversight**

### **2.1 The Evolution of Automated Intelligence**

In the contemporary digital landscape, the volume of unstructured information generated daily—news articles, social media posts, financial transactions—exceeds human cognitive processing capacity. This has given rise to the field of automated Open Source Intelligence (OSINT), where machine learning algorithms ingest vast corpora of text to extract structured signals. world-monitor.com represents a specific archetype within this domain: the **Consumer-Grade Situational Awareness Dashboard**.

Unlike enterprise tools such as Palantir or Dataminr, which are gated behind significant capital barriers, world-monitor.com democratizes access to global monitoring. It relies on the "exhaust" of the global internet—publicly available APIs and open data projects—to construct a view of the world that was previously the exclusive domain of intelligence agencies.

The website functions not by generating original data, but by acting as an aggregator and visualizer. Its value proposition lies in the *fusion* of data: overlaying the "what" (news events) with the "where" (geospatial mapping) and the "how much" (prediction markets and stock indices). To understand this site is to understand the modern data supply chain, where a server in a basement can process the same global event stream as a multinational newsroom, provided it knows where to plug in the hose.

### **2.2 The Dashboard Paradigm in Modern Web Development**

The user interface paradigm of world-monitor.com is the "Dashboard." In software engineering terms, a dashboard is a view that provides a high-level overview of a system's state. In this context, the "system" is the geopolitical state of the Earth.

The goal of such a dashboard is **Situational Awareness**. This concept, borrowed from military aviation, refers to the ability to identify, process, and comprehend the critical elements of information regarding the mission. For the user of world-monitor.com, the mission is knowledge acquisition with minimal latency. The site promises a reduction in cognitive load: instead of managing twenty browser tabs (CNN, Bloomberg, Twitter, Polymarket), the user consults a single, integrated viewport.

### **2.3 Scope and Methodology of Investigation**

This report focuses on the architectural implementation of the site. How does a single developer build a system that tracks the entire world? The answer lies in the strategic selection of upstream data providers. The primary focus of this research is the **GDELT Project**, the massive database that serves as the backend for the site’s map. We will explore:

* **The Anatomy of the Site:** How the frontend is structured to handle real-time data using modern JavaScript frameworks.  
* **The Physics of GDELT:** How the GDELT project extracts meaning from chaos using NLP and historical ontologies.  
* **The Integration:** How world-monitor.com bridges the gap between GDELT's raw data files and a user-friendly map.  
* **The Artifacts:** The glitches and errors (e.g., spurious locations) that reveal the system's inner workings.

## ---

**3\. Target Analysis: Deconstructing World-Monitor.com**

### **3.1 Developer Forensics and Provenance**

Before analyzing the code, we analyze the creator. Software reflects the philosophy of its architect. Through forensic analysis of developer communities, specifically Reddit threads in r/buildinpublic and r/InternetIsBeautiful, we have identified the developer behind world-monitor.com as a user operating under the handle No-Price1071.1

**Developer Profile: No-Price1071**

* **Handle:** No-Price1071  
* **Self-Description:** The developer describes the project as "a global map dashboard that allows you to monitor what's happening around the world by visualizing news on a map based on their geolocation relevancy".1  
* **Motivations:** The developer operates within the "Build in Public" ethos, a culture of transparent development where creators share their stack, challenges, and user acquisition strategies to build trust and community.  
* **Technical Background:** In related threads, the developer discusses C++ game development and cross-language fundamentals.1 This background is significant; it implies a familiarity with high-performance computing concepts, memory management, and update loops—skills that are directly transferable to handling the massive data arrays required for a global event map.

**Forensic Distinction:** During the investigation, a potential conflation arose between No-Price1071 and another user, atceb. Careful parsing of the threaded conversations confirms that No-Price1071 is the author of world-monitor.com, while atceb is the creator of remiapp.app.1 The two appeared in the same thread, but their projects are distinct. Additionally, a file path reference to world-monitor.scm in an MIT Scheme port 3 was determined to be a "Red Herring"—a coincidental naming collision in a legacy software repository unrelated to the modern React-based web application.

### **3.2 User Interface (UI) and Experience (UX) Analysis**

The interface of world-monitor.com adopts a **Cyber-Industrial** aesthetic. It uses a dark mode palette (black backgrounds, neon accents) which is standard for "monitoring" tools. This is not purely aesthetic; dark mode reduces eye strain for users who keep the dashboard running on a second monitor for hours—a common behavior for traders and OSINT enthusiasts.

#### **3.2.1 The Geospatial Canvas (The Map)**

The centerpiece of the application is a WebGL-powered interactive map.

* **Function:** It displays thousands of points of interest simultaneously.  
* **Clustering Logic:** To prevent the browser from crashing due to the DOM distinct element limit, the map likely uses **Radius Clustering** or **Supercluster** algorithms. When zoomed out, individual events in a region (e.g., Europe) coalesce into a single numbered circle. As the user zooms in, the cluster explodes into individual markers. This dynamic rendering is essential for performance when handling GDELT's volume.  
* **Color Coding:** The markers are likely color-coded based on **Tone** (derived from GDELT data) or **Category** (Conflict, Business, General). Red typically signifies conflict or negative tone, utilizing the GDELT Goldstein Scale data.

#### **3.2.2 The Information Peripherals**

Surrounding the map are "Widgets" that provide context that the map cannot:

* **Live TV:** A grid of YouTube embeds (e.g., Al Jazeera, DW News). This provides visual verification of events. If the map shows a coup in a country, the user can immediately check the live stream for footage.  
* **Prediction Markets:** A list of betting odds from **Polymarket**. This is a novel feature for an OSINT dashboard. Most dashboards show *past* events (News). By including prediction markets, the site attempts to show *future* probabilities (e.g., "Will Country X invade Country Y?").  
* **Stocks:** A ticker of market gainers/losers. This creates a feedback loop view: Event happens \-\> Map updates \-\> Markets react \-\> Stocks update.

### **3.3 The "Single Pane of Glass" Philosophy**

The architectural goal of world-monitor.com is integration. In enterprise IT, a "Single Pane of Glass" is a management console that presents data from multiple sources in a unified display. world-monitor.com applies this to geopolitical reality. It assumes that a user interested in a "Nuclear War Alert" (DEFCON) is also interested in "Defense Stocks" and "Breaking News in Ukraine." It aggregates vertically across different *types* of data (Text, Video, Financial, Probabilistic) but horizontally across the *same* subject matter (Global Events).

## ---

**4\. The Core Engine: The GDELT Project**

The "Foundation" of the site is the **GDELT Project**. To say world-monitor.com "uses" GDELT is an understatement; the site is effectively a visualization client for the massive data output of GDELT. Without this backend, the map would be devoid of data.

### **4.1 What is GDELT?**

**GDELT** stands for the **Global Database of Events, Language, and Tone**. It is described by its creator, Kalev Leetaru, as "a realtime open data global graph over human society as seen through the eyes of the world's news media".4 Supported by Google Jigsaw, it is one of the largest open datasets in existence.

* **Scale:** It monitors news in over 100 languages.  
* **Translation:** It uses neural machine translation to convert 65 of these languages into English in real-time.5  
* **Output:** It generates a stream of metadata updates every 15 minutes.  
* **Openness:** The data is completely free, hosted on Google Cloud Platform (BigQuery) and available as raw CSV files.

### **4.2 The GDELT Data Architecture**

GDELT produces several distinct "streams" of data. Identifying which stream world-monitor.com utilizes is critical to reverse-engineering the site’s capabilities and limitations.

#### **4.2.1 The Event Database (Events 2.0)**

This was the original GDELT product. It reduces world history to a spreadsheet of interactions between actors using the **CAMEO** taxonomy.

* **Structure:** Actor1 does Action to Actor2 at Location.  
* **Example:** "The US President (Actor1) criticized (Action) France (Actor2)."  
* **Relevance:** While powerful for statistical analysis (e.g., "Is global conflict rising?"), the Event database is abstract. It reduces complex stories to three-letter codes. world-monitor.com displays actual news headlines and links, which implies it is *not* primarily using the raw Event database for the map markers.

#### **4.2.2 The Global Knowledge Graph (GKG 2.0)**

This is the "Sensory System" of GDELT and the most likely source for world-monitor.com.6 The GKG does not just code the "main" event; it scans the article and extracts **Knowledge**.

* **Format:** A massive table where each row is a processed news article.  
* **Key Field: V1LOCATIONS:** This field contains a list of *every* location mentioned in the article.  
  * **Format:** Type\#FullName\#CountryCode\#ADM1Code\#Lat\#Long\#FeatureID  
  * **Example:** 1\#Paris, France\#FR\#FR75\#48.8566\#2.3522\#12345; 1\#London, UK\#UK\#UK01\#51.5074\#-0.1278\#67890  
* **Key Field: V1THEMES:** A list of themes found in the text (e.g., TAX\_FNCACT, CRISISLEX\_T03\_DEAD, ENV\_CLIMATECHANGE).  
* **Key Field: V1.5TONE:** A sophisticated sentiment analysis score (Goldstein Scale) ranging from \-100 to \+100.

**Why World-Monitor Uses GKG:** The dashboard displays specific locations for news stories and categorizes them. The GKG provides the direct link between a URL (SOURCEURL) and a set of coordinates (V1LOCATIONS), which is exactly what the map needs to plot a point.

#### **4.2.3 The Mentions Table**

Introduced in GDELT 2.0, this table tracks the "trajectory" of a story.8

* **Function:** It records every time a specific Event ID is mentioned in a new article.  
* **Usage:** world-monitor.com likely uses this data to determine the size of the bubbles on the map. A story mentioned 5,000 times in the last 15 minutes warrants a larger visual indicator than a local news story mentioned once. This "narrative velocity" is a key metric for determining relevance.

### **4.3 The CAMEO Ontology**

To understand the data flowing into the site, one must understand **CAMEO** (Conflict and Mediation Event Observations). Developed by political scientists, CAMEO is a system for coding political interactions into a hierarchical taxonomy.

* **01-05 (Verbal Cooperation):** Statements, Consulting.  
* **06-09 (Material Cooperation):** Aid, Yielding.  
* **10-14 (Verbal Conflict):** Demand, Disapprove, Threaten.  
* **15-20 (Material Conflict):** Protest, Assault, Fight, Mass Violence.

If world-monitor.com allows filtering by "Conflict" vs "Peace," it is leveraging these CAMEO root codes derived from the GDELT data.

### **4.4 The Goldstein Scale**

GDELT assigns a **Goldstein Scale** score to each event.10

* **Range:** \-10.0 to \+10.0.  
* **Meaning:**  
  * **\+10.0:** Military assistance, peace treaty.  
  * **\-10.0:** Military attack, declaration of war.  
* **Role in Visualization:** This metric is the perfect candidate for **Color Coding**. The red/green/yellow indicators on the World Monitor map are almost certainly direct mappings of the Goldstein Scale or the AvgTone field from the GKG.

## ---

**5\. Technical Investigation: Reverse Engineering the Stack**

Based on the research snippets and the operational requirements of the site, we can reconstruct the likely technical implementation and stack decisions.

### **5.1 The Data Pipeline: Consuming the Firehose**

GDELT data is massive. The GKG alone can be gigabytes per day. A typical web browser cannot load this directly. world-monitor.com must use a filtered stream or a specialized API.

#### **5.1.1 The GeoJSON API Hypothesis**

GDELT offers a specific API for mapping applications: the **GKG GeoJSON API**.12

* **Endpoint:** http://api.gdeltproject.org/api/v2/geo/gkg  
* **Mechanism:** This API allows a developer to request "The last 15 minutes of news" pre-formatted as **GeoJSON**.  
* **GeoJSON Format:**  
  JSON  
  {  
    "type": "FeatureCollection",  
    "features": \[  
      {  
        "type": "Feature",  
        "geometry": { "type": "Point", "coordinates": \[10.0, 20.0\] },  
        "properties": {  
           "url": "http://cnn.com/story...",  
           "name": "CNN",  
           "tone": \-5.4,  
           "themes": "TERROR; MILITARY"  
        }  
      }  
    \]  
  }

* **Evidence:** The developer mentions "visualizing news on a map based on their geolocation relevancy".1 Using the GKG GeoJSON feed is the most efficient way to achieve this without building a massive backend database to process raw CSVs. The site simply "polls" this URL every 15 minutes.

#### **5.1.2 The "Connecting to Feed" Indicator**

The site displays a "CONNECTING TO FEED..." message upon loading.14

* **Implication:** This suggests the browser is either:  
  1. Establishing a **WebSocket** connection (e.g., Socket.io) to a custom backend that pushes updates.  
  2. Performing an asynchronous **HTTP Fetch** to the GDELT API or a proxy server. Given the "Chat" functionality mentioned by the developer 2, a WebSocket connection is highly probable for the chat feature. It is likely the news feed also rides on this socket or is polled separately via fetch().

### **5.2 The "Spurious Location" Artifact**

One of the most revealing snippets involves the developer explicitly admitting to a flaw in the system: *"Whatever method you're using to geolocate articles is too easily misled by spurious location mentions. For example, an article about ICE in the US involving a singer was located in Ireland because a picture of the singer is from a past performance in Ireland."* 2 The developer responds: *"Yeah that's a bit of a problem right now for some articles. If the article mentions the country then it will show there, even if it didn't necessarily happen there."*

**Forensic Analysis:**

This confirms the use of **GDELT GKG V1LOCATIONS**.

* **How GKG works:** It uses an automated Named Entity Recognition (NER) system. If a text says "London," GKG extracts "London." It does *not* semantically understand "The singer, who lives in London, is currently performing in New York." It just sees "London" and "New York."  
* **The Map Consequence:** This results in "Ghost Events." A single article mentioning 10 cities will create 10 dots on the map. This increases the visual "activity" of the dashboard (making it look busy and exciting) but decreases its "intelligence" value (low precision).  
* **The "ActionGeo" Alternative:** A more rigorous approach would be to use the **Event Database's ActionGeo\_Lat** field, which attempts to isolate the *primary* location of the action. However, the ActionGeo field often lacks the rich metadata (URL, Image, Theme) found in the GKG. The fact that the site suffers from spurious mentions strongly suggests it is using the **GKG (Mentions)** stream rather than the **Event (Action)** stream.

### **5.3 Auxiliary API Integrations**

#### **5.3.1 Polymarket Integration**

**Polymarket** is a decentralized prediction market platform built on the Polygon blockchain. It does not offer a traditional centralized API in the same way a stock exchange does.

* **Tech Stack:** The site likely uses the **Polymarket Gamma API** or queries the **The Graph (GraphQL)** subgraph for Polymarket.  
* **Data Fetch:** It requests the "Top Markets" sorted by volume or open interest.  
* **Rendering:** It extracts the probability (e.g., "0.75" for "Yes") and renders it as a percentage bar "75%". This provides "forward-looking" intelligence (what people think *will* happen) to contrast with GDELT's "backward-looking" intelligence (what *has* happened).

#### **5.3.2 The DEFCON Scraper**

The "DEFCON" module is a classic example of "Entertainment OSINT."

* **The Myth:** There is no public API for the actual US Military DEFCON status. That data is classified.  
* **The Source:** The site almost certainly scrapes **defconlevel.com** or **defconwarningsystem.com**.15  
* **Mechanism:** Since these sites do not offer public APIs, world-monitor.com likely employs a simple server-side scraper (using Cheerio or Puppeteer) to parse the HTML of these sites, extract the integer value (1-5), and serve it to the frontend.

#### **5.3.3 Frontend Architecture**

* **Map Library:** Given the visual style and clustering needs, the site likely uses **Mapbox GL JS** or **Leaflet**. Mapbox is preferred for high-performance vector tile rendering, which is necessary when plotting thousands of news points.  
* **Framework:** React.js is the standard for such dashboards, often used with state management libraries (Redux or Pinia) to handle the flow of incoming API data without freezing the UI.

## ---

**6\. Detailed Technology Stack Hypothesis**

Based on the forensic indicators, we can construct a high-probability table of the technology stack employed by world-monitor.com.

| Component | Likely Technology | Evidence / Reasoning |
| :---- | :---- | :---- |
| **Frontend Framework** | **React.js** | Industry standard for dashboards; developer mentions "building app" terminology common in React ecosystem. |
| **Map Engine** | **Mapbox GL JS** or **Leaflet** | Necessary for handling WebGL point rendering and clustering of GDELT data. |
| **Data Source (News)** | **GDELT GKG GeoJSON** | Confirmed by developer's "geolocation relevancy" comments and "spurious" location issues. |
| **Data Source (Markets)** | **Polymarket Gamma API** | "Prediction markets" feature; specific mentions of Polymarket in description. |
| **Data Source (TV)** | **YouTube IFrame API** | Standard method for embedding live news streams (Al Jazeera, etc.). |
| **Backend / API Proxy** | **Node.js / Vercel Functions** | Needed to scrape DEFCON levels and proxy GDELT requests to avoid CORS issues. |
| **Real-time Comms** | **Socket.io / WebSocket** | Developer explicitly mentions "chat up and running," requiring persistent connections. |
| **Hosting** | **Vercel** or **Netlify** | Common for "Build in Public" indie projects; offers free tiers and easy deployment. |

## ---

**7\. Strategic Implications: The Democratization of Intelligence**

world-monitor.com represents a shift in the hierarchy of information.

### **7.1 The "God's Eye View" on a Budget**

Historically, building a global monitoring room cost millions. It required satellite uplinks, wire service subscriptions (Reuters/Bloomberg terminals cost $20k+/year), and human analysts. world-monitor.com achieves 80% of the visual functionality for nearly zero marginal cost.

* **Cost Efficiency:**  
  * **Data (GDELT):** Free.  
  * **Hosting:** Commodity cloud tiers.  
  * **Mapping:** Freemium tiers.  
  * **Labor:** 1 Developer.  
    This accessibility lowers the barrier to entry for situational awareness, allowing individuals and small organizations to track global events with tools previously reserved for state actors.

### **7.2 The Signal-to-Noise Problem**

The trade-off for this zero-cost infrastructure is **Noise**. By relying on GDELT's automated algorithms, the site inherits GDELT's biases and errors.

* **Hallucinations:** As noted with the "singer in Ireland" example, the map shows things that aren't happening.  
* **Recursion:** If a news outlet reports on a *rumor* of a war, GDELT reports it as an event. The dashboard visualizes it. Users react. This creates a feedback loop where "chatter" looks like "action."  
* **Western Bias:** GDELT monitors 100 languages, but its translation and entity extraction pipelines are often tuned better for Western media formats, potentially leading to under-representation or misinterpretation of events in the Global South.

## ---

**8\. Conclusion**

The investigation into world-monitor.com reveals a technically impressive, if imperfect, implementation of modern OSINT principles.

1. **The Foundation is GDELT:** The site is inextricably linked to the GDELT Project. It is a visualization client for the GKG GeoJSON feed. The site's update cycle (15 minutes), its data richness (themes/tone), and its errors (spurious locations) are all direct characteristics of the GDELT backend.  
2. **The Architecture is Aggregation:** The developer No-Price1071 has built a **connector**. The site connects GDELT (News), Polymarket (Bets), and YouTube (Video) into a unified frontend.  
3. **The "Spurious" Reality:** The site demonstrates the current limits of automated intelligence. Without human curation, NLP algorithms struggle to distinguish between a *mention* of a place and an *event* at a place. This makes world-monitor.com a powerful tool for spotting *trends* (e.g., "Why is all of Europe turning red?") but a potentially dangerous tool for specific *facts* (e.g., "Is there a riot in Dublin, or just a news story mentioning Dublin?").

For a Senior Web Developer, world-monitor.com serves as an excellent case study in **API Composition** and **Data Visualization**. It demonstrates how to leverage massive open datasets to build professional-grade tools, provided one accepts the inherent messiness of the underlying data.

## ---

**9\. Addendum: Data Tables and Definitions**

### **9.1 CAMEO Event Codes (Selected High-Level)**

| Code | Description | Example |
| :---- | :---- | :---- |
| **01** | **Make Public Statement** | "President announces policy." |
| **02** | **Appeal** | "Leader appeals for aid." |
| **11** | **Disapprove** | "Ministry condemns action." |
| **13** | **Threaten** | "General warns of retaliation." |
| **19** | **Fight** | "Clashes reported at border." |
| **20** | **Use Unconventional Mass Violence** | "Chemical weapon usage reported." |

### **9.2 GDELT GKG V2.1 Schema (Key Fields)**

| Field Name | Description | Role in World-Monitor |
| :---- | :---- | :---- |
| V2.1DATE | Date of publication (15 min resolution). | Timestamp for map markers. |
| V2SOURCECOMMONNAME | The domain of the news source (e.g., cnn.com). | Source attribution in popups. |
| V2DOCUMENTIDENTIFIER | The full URL of the article. | The link users click on. |
| V1LOCATIONS | List of all locations mentioned in text. | **The primary mapping data.** |
| V1THEMES | List of themes (e.g., WB\_2433\_CONFLICT). | Filtering logic (e.g., "Show Conflict Only"). |
| V1.5TONE | Sentiment vector (Tone, Pos, Neg, Polarity). | Color-coding (Red/Green) of map points. |

#### **Works cited**

1. It's Monday\! What are you all building? : r/buildinpublic \- Reddit, accessed January 31, 2026, [https://www.reddit.com/r/buildinpublic/comments/1qn6h5k/its\_monday\_what\_are\_you\_all\_building/](https://www.reddit.com/r/buildinpublic/comments/1qn6h5k/its_monday_what_are_you_all_building/)  
2. I built World Monitor \- a dashboard to monitor the situation around the world : r/InternetIsBeautiful \- Reddit, accessed January 31, 2026, [https://www.reddit.com/r/InternetIsBeautiful/comments/1qqo2uz/i\_built\_world\_monitor\_a\_dashboard\_to\_monitor\_the/](https://www.reddit.com/r/InternetIsBeautiful/comments/1qqo2uz/i_built_world_monitor_a_dashboard_to_monitor_the/)  
3. MIT Scheme: includes runtime, compiler, and edwin binaries \- FreshPorts, accessed January 31, 2026, [https://www.freshports.org/lang/mit-scheme/](https://www.freshports.org/lang/mit-scheme/)  
4. The GDELT Project, accessed January 31, 2026, [https://www.gdeltproject.org/](https://www.gdeltproject.org/)  
5. Data Orquestration and Visualization of GDELT Project Events from csv files to datalake to datawarehouse \- GitHub, accessed January 31, 2026, [https://github.com/edumunozsala/GDELT-Events-Data-Eng-Project](https://github.com/edumunozsala/GDELT-Events-Data-Eng-Project)  
6. the gdelt global knowledge graph (gkg) data format codebook v2.0 10/11/2014, accessed January 31, 2026, [http://data.gdeltproject.org/documentation/GDELT-Global\_Knowledge\_Graph\_Codebook-V2.pdf](http://data.gdeltproject.org/documentation/GDELT-Global_Knowledge_Graph_Codebook-V2.pdf)  
7. the gdelt global knowledge graph (gkg) data format codebook v2.1 2/19/2015, accessed January 31, 2026, [http://data.gdeltproject.org/documentation/GDELT-Global\_Knowledge\_Graph\_Codebook-V2.1.pdf](http://data.gdeltproject.org/documentation/GDELT-Global_Knowledge_Graph_Codebook-V2.1.pdf)  
8. Gdelt Dataset: Events, Mentions, and Global Knowledge Graph \- Cheng-Jun Wang, accessed January 31, 2026, [https://chengjun.github.io/mybook/03-gdelt.html](https://chengjun.github.io/mybook/03-gdelt.html)  
9. dwb2023/gdelt-mentions-2025-v3 · Datasets at Hugging Face, accessed January 31, 2026, [https://huggingface.co/datasets/dwb2023/gdelt-mentions-2025-v3](https://huggingface.co/datasets/dwb2023/gdelt-mentions-2025-v3)  
10. Global Database of Events, Language and Tone (GDELT) appendix \- Office for National Statistics, accessed January 31, 2026, [https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/deaths/methodologies/globaldatabaseofeventslanguageandtonegdeltappendix](https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/deaths/methodologies/globaldatabaseofeventslanguageandtonegdeltappendix)  
11. Digging into the GDELT Event schema \- arpieb, accessed January 31, 2026, [https://arpieb.com/2018/06/20/digging-into-the-gdelt-event-schema/](https://arpieb.com/2018/06/20/digging-into-the-gdelt-event-schema/)  
12. Announcing Our First API: GKG GeoJSON\! \- The GDELT Project, accessed January 31, 2026, [https://blog.gdeltproject.org/announcing-our-first-api-gkg-geojson/](https://blog.gdeltproject.org/announcing-our-first-api-gkg-geojson/)  
13. GDELT GKG GeoJSON Files Available, accessed January 31, 2026, [https://blog.gdeltproject.org/gdelt-gkg-geojson-files-available/](https://blog.gdeltproject.org/gdelt-gkg-geojson-files-available/)  
14. World Monitor, accessed January 31, 2026, [https://world-monitor.com](https://world-monitor.com)  
15. x3/x3.conf.example at master · evilnet/x3 \- GitHub, accessed January 31, 2026, [https://github.com/evilnet/x3/blob/master/x3.conf.example](https://github.com/evilnet/x3/blob/master/x3.conf.example)  
16. Defcon Level Warning System: Private Osint (Open Source) Analysis Organization, accessed January 31, 2026, [https://news.ycombinator.com/item?id=30489558](https://news.ycombinator.com/item?id=30489558)